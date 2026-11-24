/**
 * T1.11 — Rate limiter de ventana fija en PostgreSQL.
 * Refs: specs/02-architecture-plan.md §5.6; ADR-0008.
 */
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import type { Clock } from "@/application/ports/clock";
import type { RateLimitDecision, RateLimitRule } from "@/application/ports/rate-limiter";
import { createPrismaClient } from "@/infrastructure/db/prisma-client";
import { PgRateLimiter } from "./pg-rate-limiter";

const { testUrl } = inject("testDatabase");
const prisma = createPrismaClient(testUrl);

/** Inicio de ventana alineado con cualquier duración de minuto (epoch). */
const START = new Date("2026-11-24T08:00:00.000Z");
const FIVE_PER_MINUTE: RateLimitRule = { limit: 5, windowSeconds: 60 };

class FakeClock implements Clock {
  private current = START.getTime();
  now(): Date {
    return new Date(this.current);
  }
  set(offsetMs: number): void {
    this.current = START.getTime() + offsetMs;
  }
}

let clock: FakeClock;
let limiter: PgRateLimiter;

const counterOf = async (key: string) =>
  (await prisma.rateLimitBucket.findFirst({ where: { key }, orderBy: { windowStart: "desc" } }))?.count;

async function consumeTimes(times: number, key: string, rule: RateLimitRule): Promise<RateLimitDecision[]> {
  const decisions: RateLimitDecision[] = [];
  for (let attempt = 0; attempt < times; attempt += 1) decisions.push(await limiter.consume(key, rule));
  return decisions;
}

beforeEach(async () => {
  await prisma.rateLimitBucket.deleteMany();
  clock = new FakeClock();
  limiter = new PgRateLimiter(prisma, clock);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("T1.11 límite por ventana fija [02 §5.6]", () => {
  it("con un límite de 5, las 5 primeras se permiten y la 6.ª se rechaza con retryAfterSeconds", async () => {
    clock.set(10_000); // 10 s dentro de la ventana de 60 s
    const decisions = await consumeTimes(6, "login:ip:1.2.3.4", FIVE_PER_MINUTE);

    expect(decisions.slice(0, 5)).toEqual([4, 3, 2, 1, 0].map((remaining) => ({ allowed: true, remaining })));
    expect(decisions[5]).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });

  it("retryAfterSeconds se redondea hacia arriba y es al menos 1", async () => {
    clock.set(10_400);
    await consumeTimes(5, "k", FIVE_PER_MINUTE);
    expect(await limiter.consume("k", FIVE_PER_MINUTE)).toEqual({ allowed: false, retryAfterSeconds: 50 });

    clock.set(59_999);
    expect(await limiter.consume("k", FIVE_PER_MINUTE)).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("en la ventana siguiente se vuelve a permitir", async () => {
    await consumeTimes(6, "login:ip:1.2.3.4", FIVE_PER_MINUTE);
    clock.set(60_000);
    expect(await limiter.consume("login:ip:1.2.3.4", FIVE_PER_MINUTE)).toEqual({ allowed: true, remaining: 4 });
  });

  it("las ventanas están alineadas: 59,999 s después del inicio sigue siendo la misma", async () => {
    await consumeTimes(5, "k", FIVE_PER_MINUTE);
    clock.set(59_999);
    expect((await limiter.consume("k", FIVE_PER_MINUTE)).allowed).toBe(false);
  });

  it("cada clave tiene su propio contador", async () => {
    await consumeTimes(6, "login:ip:1.2.3.4", FIVE_PER_MINUTE);
    expect(await limiter.consume("login:ip:5.6.7.8", FIVE_PER_MINUTE)).toEqual({ allowed: true, remaining: 4 });
  });
});

describe("peek: consulta sin contar (límite de login por ip, solo fallos; 02 §5.6)", () => {
  it("sin contador permite y no crea ninguna fila", async () => {
    expect(await limiter.peek("solo-fallos", FIVE_PER_MINUTE)).toEqual({ allowed: true, remaining: 4 });
    expect(await counterOf("solo-fallos")).toBeUndefined();
  });

  it("no incrementa el contador: muchas consultas no agotan el límite", async () => {
    await consumeTimes(2, "solo-fallos", FIVE_PER_MINUTE);
    for (let index = 0; index < 10; index += 1) await limiter.peek("solo-fallos", FIVE_PER_MINUTE);
    expect(await counterOf("solo-fallos")).toBe(2);
    expect(await limiter.peek("solo-fallos", FIVE_PER_MINUTE)).toEqual({ allowed: true, remaining: 2 });
  });

  it("con el límite alcanzado rechaza con retryAfterSeconds, igual que consume", async () => {
    clock.set(10_000);
    await consumeTimes(5, "solo-fallos", FIVE_PER_MINUTE);
    expect(await limiter.peek("solo-fallos", FIVE_PER_MINUTE)).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });

  it("en la ventana siguiente vuelve a permitir", async () => {
    await consumeTimes(5, "solo-fallos", FIVE_PER_MINUTE);
    clock.set(60_000);
    expect(await limiter.peek("solo-fallos", FIVE_PER_MINUTE)).toEqual({ allowed: true, remaining: 4 });
  });

  it("valida la clave y la regla como consume", async () => {
    await expect(limiter.peek("", FIVE_PER_MINUTE)).rejects.toThrow(RangeError);
    await expect(limiter.peek("k", { limit: 0, windowSeconds: 60 })).rejects.toThrow(RangeError);
  });
});

describe("T1.11 atomicidad (INSERT … ON CONFLICT DO UPDATE, ADR-0008)", () => {
  it("20 incrementos concurrentes dejan el contador en exactamente 20", async () => {
    const rule = { limit: 100, windowSeconds: 60 };
    const decisions = await Promise.all(Array.from({ length: 20 }, () => limiter.consume("concurrente", rule)));

    expect(await counterOf("concurrente")).toBe(20);
    // Cada petición vio un valor distinto del contador: ninguna se perdió ni se duplicó.
    const remaining = decisions.map((decision) => (decision.allowed ? decision.remaining : -1)).sort((a, b) => a - b);
    expect(remaining).toEqual(Array.from({ length: 20 }, (_, index) => 80 + index));
  });

  it("con 20 peticiones concurrentes y límite 5, se permiten exactamente 5", async () => {
    const decisions = await Promise.all(Array.from({ length: 20 }, () => limiter.consume("ráfaga", FIVE_PER_MINUTE)));
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
  });
});

describe("T1.11 purga de ventanas pasadas (ADR-0008)", () => {
  it("borra los contadores de ventanas que ya no pueden afectar a ningún límite y conserva los vigentes", async () => {
    await limiter.consume("antigua", FIVE_PER_MINUTE);
    clock.set(2 * 60 * 60_000); // 2 h después
    await limiter.consume("vigente", FIVE_PER_MINUTE);

    expect(await limiter.purgeExpired(60 * 60)).toBe(1); // ventanas de hasta 1 h
    expect(await counterOf("antigua")).toBeUndefined();
    expect(await counterOf("vigente")).toBe(1);
  });
});

describe("T1.11 entradas inválidas (errores de programación)", () => {
  it.each([
    ["límite 0", { limit: 0, windowSeconds: 60 }],
    ["límite no entero", { limit: 1.5, windowSeconds: 60 }],
    ["ventana 0", { limit: 5, windowSeconds: 0 }],
    ["ventana no entera", { limit: 5, windowSeconds: 0.5 }],
  ])("rechaza una regla con %s", async (_case, rule) => {
    await expect(limiter.consume("k", rule)).rejects.toThrow(RangeError);
  });

  it.each([
    ["vacía", ""],
    ["de más de 512 caracteres", "k".repeat(513)],
  ])("rechaza una clave %s", async (_case, key) => {
    await expect(limiter.consume(key, FIVE_PER_MINUTE)).rejects.toThrow(RangeError);
  });
});
