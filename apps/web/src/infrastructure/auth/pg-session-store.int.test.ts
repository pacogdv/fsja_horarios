/**
 * T1.10 — Almacén de sesiones opacas en PostgreSQL.
 * Refs: specs/02-architecture-plan.md §5.2 (pasos 7, 8 y 10); ADR-0002; CLAUDE.md §3.1.
 */
import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import type { Clock } from "@/application/ports/clock";
import { createPrismaClient } from "@/infrastructure/db/prisma-client";
import { PgSessionStore, SESSION_ABSOLUTE_TTL_MS, SESSION_IDLE_TTL_MS, SESSION_RENEWAL_INTERVAL_MS } from "./pg-session-store";

const { testUrl } = inject("testDatabase");
const prisma = createPrismaClient(testUrl);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = new Date("2026-11-24T08:00:00.000Z");

/** Reloj controlable: los tests avanzan el tiempo sin esperar. */
class FakeClock implements Clock {
  private current = START.getTime();
  now(): Date {
    return new Date(this.current);
  }
  advance(milliseconds: number): void {
    this.current += milliseconds;
  }
}

let clock: FakeClock;
let store: PgSessionStore;
let userId: string;

async function createUser(email: string): Promise<string> {
  const user = await prisma.appUser.create({
    data: { email, passwordHash: "$argon2id$test", displayName: "Docente", role: "DOCENTE" },
  });
  return user.id;
}

const sha256 = (token: string) => createHash("sha256").update(Buffer.from(token, "base64url")).digest();
const at = (offset: number) => new Date(START.getTime() + offset);
const storedRow = (token: string) => prisma.userSession.findUnique({ where: { tokenHash: sha256(token) } });

beforeEach(async () => {
  await prisma.userSession.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.appUser.deleteMany();
  clock = new FakeClock();
  store = new PgSessionStore(prisma, clock);
  userId = await createUser("docente@x.es");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("T1.10 caducidades [02 §5.2, ADR-0002]", () => {
  it("8 h absolutas, 30 min de inactividad y renovación como máximo cada 5 min", () => {
    expect(SESSION_ABSOLUTE_TTL_MS).toBe(8 * HOUR);
    expect(SESSION_IDLE_TTL_MS).toBe(30 * MINUTE);
    expect(SESSION_RENEWAL_INTERVAL_MS).toBe(5 * MINUTE);
  });
});

describe("T1.10 token y almacenamiento", () => {
  it("el token tiene 32 bytes aleatorios (base64url) y cada sesión tiene uno distinto", async () => {
    const first = await store.create({ userId, ip: null, userAgent: null });
    const second = await store.create({ userId, ip: null, userAgent: null });
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first.token, "base64url")).toHaveLength(32);
    expect(first.token).not.toBe(second.token);
  });

  it("en BD solo se guarda su SHA-256: el token en claro no aparece en la tabla", async () => {
    const { token } = await store.create({ userId, ip: "203.0.113.7", userAgent: "Firefox" });
    const raw = Buffer.from(token, "base64url");

    const row = await storedRow(token);
    expect(row).not.toBeNull();
    expect(Buffer.from(row!.tokenHash).equals(sha256(token))).toBe(true);

    // Se busca el token en cualquier representación, en todas las columnas de todas las filas.
    const dump = (await prisma.$queryRaw<{ row: string }[]>`SELECT row_to_json(s)::text AS row FROM user_session s`)
      .map((entry) => entry.row)
      .join("\n");
    for (const representation of [token, raw.toString("hex"), raw.toString("base64"), raw.toString("base64url")]) {
      expect(dump).not.toContain(representation);
    }
  });

  it("crea la sesión con caducidad absoluta a 8 h e inactividad a 30 min", async () => {
    const { session } = await store.create({ userId, ip: null, userAgent: null });
    expect(session).toMatchObject({ userId, expiresAt: at(8 * HOUR), idleExpiresAt: at(30 * MINUTE) });
  });

  it("guarda la IP y el user agent", async () => {
    const { token } = await store.create({ userId, ip: "2001:db8::1", userAgent: "Mozilla/5.0" });
    expect(await storedRow(token)).toMatchObject({ ip: "2001:db8::1", userAgent: "Mozilla/5.0" });
  });

  it("una IP no válida se guarda como null (no provoca un error de BD)", async () => {
    const { token } = await store.create({ userId, ip: "no-es-una-ip'; DROP TABLE user_session;--", userAgent: null });
    expect((await storedRow(token))?.ip).toBeNull();
  });

  it("recorta el user agent a 512 caracteres", async () => {
    const { token } = await store.create({ userId, ip: null, userAgent: "x".repeat(10_000) });
    expect((await storedRow(token))?.userAgent).toHaveLength(512);
  });

  it("al recortar el user agent no parte un carácter en dos (no guarda medio emoji como �)", async () => {
    const { token } = await store.create({ userId, ip: null, userAgent: `${"x".repeat(511)}😀resto` });
    expect((await storedRow(token))?.userAgent).toBe("x".repeat(511));
  });
});

describe("T1.10 findValid", () => {
  it("devuelve la sesión con el token correcto", async () => {
    const { token } = await store.create({ userId, ip: null, userAgent: null });
    expect(await store.findValid(token)).toMatchObject({ userId });
  });

  it.each([
    ["token desconocido", "A".repeat(43)],
    ["vacío", ""],
    ["demasiado corto", "abc"],
    ["con caracteres fuera de base64url", `${"A".repeat(42)}+`],
    ["con relleno", `${"A".repeat(42)}=`],
    ["demasiado largo", "A".repeat(5000)],
  ])("devuelve null sin lanzar con un %s", async (_case, token) => {
    await store.create({ userId, ip: null, userAgent: null });
    await expect(store.findValid(token)).resolves.toBeNull();
  });

  it("caduca tras 30 min sin actividad", async () => {
    const { token } = await store.create({ userId, ip: null, userAgent: null });
    clock.advance(30 * MINUTE - 1);
    expect(await store.findValid(token)).not.toBeNull();

    clock.advance(30 * MINUTE);
    expect(await store.findValid(token)).toBeNull();
  });

  it("una sesión caducada se borra al consultarla", async () => {
    const { token } = await store.create({ userId, ip: null, userAgent: null });
    clock.advance(30 * MINUTE);
    expect(await store.findValid(token)).toBeNull();
    expect(await storedRow(token)).toBeNull();
  });

  it("la actividad renueva la inactividad, como máximo una vez cada 5 min", async () => {
    const { token } = await store.create({ userId, ip: null, userAgent: null });

    clock.advance(5 * MINUTE - 1);
    expect((await store.findValid(token))?.idleExpiresAt).toEqual(at(30 * MINUTE));
    expect((await storedRow(token))?.idleExpiresAt).toEqual(at(30 * MINUTE));

    clock.advance(1);
    expect((await store.findValid(token))?.idleExpiresAt).toEqual(at(35 * MINUTE));
    expect((await storedRow(token))?.idleExpiresAt).toEqual(at(35 * MINUTE));
  });

  it("con actividad continua, la sesión caduca igualmente a las 8 h (caducidad absoluta)", async () => {
    const { token } = await store.create({ userId, ip: null, userAgent: null });
    for (let elapsed = 0; elapsed < 8 * HOUR - 10 * MINUTE; elapsed += 10 * MINUTE) {
      clock.advance(10 * MINUTE);
      expect(await store.findValid(token)).not.toBeNull();
    }
    clock.advance(10 * MINUTE); // 8 h exactas
    expect(await store.findValid(token)).toBeNull();
  });

  it("la renovación nunca lleva la inactividad más allá de la caducidad absoluta", async () => {
    const { token } = await store.create({ userId, ip: null, userAgent: null });
    for (let elapsed = 0; elapsed < 7 * HOUR + 50 * MINUTE; elapsed += 10 * MINUTE) {
      clock.advance(10 * MINUTE);
      await store.findValid(token);
    }
    const session = await store.findValid(token);
    expect(session?.idleExpiresAt.getTime()).toBeLessThanOrEqual(session!.expiresAt.getTime());
  });
});

describe("T1.10 revocación y purga", () => {
  it("revoke invalida la sesión de ese token (logout)", async () => {
    const kept = await store.create({ userId, ip: null, userAgent: null });
    const revoked = await store.create({ userId, ip: null, userAgent: null });
    await store.revoke(revoked.token);
    expect(await store.findValid(revoked.token)).toBeNull();
    expect(await store.findValid(kept.token)).not.toBeNull();
  });

  it("revoke con un token mal formado o desconocido no hace nada y no lanza", async () => {
    await expect(store.revoke("no-es-un-token")).resolves.toBeUndefined();
    await expect(store.revoke("A".repeat(43))).resolves.toBeUndefined();
  });

  it("revokeAllForUser invalida todas las sesiones del usuario y solo las suyas", async () => {
    const otherUserId = await createUser("otra@x.es");
    const mine = [await store.create({ userId, ip: null, userAgent: null }), await store.create({ userId, ip: null, userAgent: null })];
    const theirs = await store.create({ userId: otherUserId, ip: null, userAgent: null });

    await store.revokeAllForUser(userId);

    for (const { token } of mine) expect(await store.findValid(token)).toBeNull();
    expect(await store.findValid(theirs.token)).not.toBeNull();
  });

  it("purgeExpired borra las sesiones caducadas por tiempo absoluto o por inactividad y conserva las válidas", async () => {
    // Cada sesión caduca por una sola causa, comprobada a la 1 h de START.
    // Creada en START: inactividad hasta los 30 min (caducada), absoluta hasta las 8 h (vigente).
    const idleExpired = await store.create({ userId, ip: null, userAgent: null });

    clock.advance(1 * HOUR);
    // Creada a la 1 h: inactividad hasta la 1 h 30 y absoluta hasta las 9 h (vigente).
    const active = await store.create({ userId, ip: null, userAgent: null });
    // Inactividad vigente (1 h 30), pero caducidad absoluta forzada a la 1 h (caducada).
    const absoluteExpired = await store.create({ userId, ip: null, userAgent: null });
    await prisma.userSession.update({
      where: { tokenHash: sha256(absoluteExpired.token) },
      data: { expiresAt: at(1 * HOUR) },
    });
    expect(await store.purgeExpired()).toBe(2);

    expect(await storedRow(idleExpired.token)).toBeNull();
    expect(await storedRow(absoluteExpired.token)).toBeNull();
    expect(await storedRow(active.token)).not.toBeNull();
  });
});
