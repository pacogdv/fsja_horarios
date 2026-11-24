// @vitest-environment node
/**
 * T1.11 — IP del cliente para el rate limiting, según specs/02-architecture-plan.md §5.6 (ADR-0008).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { clientIpFromForwardedFor, UNKNOWN_CLIENT_IP } from "./client-ip";

describe("T1.11 IP del cliente tras proxies de confianza (TRUSTED_PROXY_HOPS ≥ 1)", () => {
  it("con 1 salto y X-Forwarded-For: 6.6.6.6, 1.2.3.4, la IP es 1.2.3.4", () => {
    expect(clientIpFromForwardedFor("6.6.6.6, 1.2.3.4", 1)).toBe("1.2.3.4");
  });

  it("si el cliente añade entradas falsas a la izquierda, la IP no cambia", () => {
    expect(clientIpFromForwardedFor("9.9.9.9, 8.8.8.8, 6.6.6.6, 1.2.3.4", 1)).toBe("1.2.3.4");
    expect(clientIpFromForwardedFor("<script>, 1.2.3.4", 1)).toBe("1.2.3.4");
  });

  it("con 2 saltos toma la segunda entrada desde la derecha", () => {
    expect(clientIpFromForwardedFor("6.6.6.6, 1.2.3.4, 10.0.0.1", 2)).toBe("1.2.3.4");
  });

  it("si hay menos entradas que saltos (la petición no pasó por el proxy) da unknown", () => {
    expect(clientIpFromForwardedFor("1.2.3.4", 2)).toBe(UNKNOWN_CLIENT_IP);
  });

  it.each([
    ["ausente", null],
    ["indefinida", undefined],
    ["vacía", ""],
    ["solo comas y espacios", " , ,"],
    ["con una entrada que no es una IP", "6.6.6.6, <script>"],
    ["con puerto", "6.6.6.6, 1.2.3.4:8080"],
    ["con un octeto fuera de rango", "6.6.6.6, 999.1.1.1"],
    ["con la entrada de confianza vacía", "1.2.3.4, "],
  ])("una cabecera %s da unknown", (_case, header) => {
    expect(clientIpFromForwardedFor(header, 1)).toBe(UNKNOWN_CLIENT_IP);
  });

  it("normaliza IPv6 (minúsculas) e IPv4 mapeada en IPv6, para no tener dos claves por cliente", () => {
    expect(clientIpFromForwardedFor("2001:DB8::1", 1)).toBe("2001:db8::1");
    expect(clientIpFromForwardedFor("::ffff:203.0.113.7", 1)).toBe("203.0.113.7");
  });

  it("soporta cabeceras muy largas sin degradarse", () => {
    const header = `${Array.from({ length: 50_000 }, () => "6.6.6.6").join(", ")}, 1.2.3.4`;
    expect(clientIpFromForwardedFor(header, 1)).toBe("1.2.3.4");
  });

  it.each([-1, 1.5, 4, Number.NaN])("rechaza un número de saltos inválido (%s)", (hops) => {
    expect(() => clientIpFromForwardedFor("1.2.3.4", hops)).toThrow(RangeError);
  });
});

/**
 * Verificación de TRUSTED_PROXY_HOPS = 0 en el servidor standalone de Next.js (02 §5.6). Se comprobó
 * arrancando `.next/standalone/apps/web/server.js` (Next.js 16.4.5) con una ruta que devolvía la cabecera:
 *
 *   petición sin X-Forwarded-For            → "127.0.0.1"   (Next.js añade la IP del socket)
 *   X-Forwarded-For: 6.6.6.6               → "6.6.6.6"     (llega tal cual: falsificable)
 *   X-Forwarded-For: 9.9.9.9, 6.6.6.6      → "9.9.9.9, 6.6.6.6"
 *   X-Forwarded-For: <script>              → "<script>"
 *
 * Por eso, con 0 saltos la IP solo es fiable si el cliente no envía la cabecera, y env.ts rechaza
 * APP_ENV=production con TRUSTED_PROXY_HOPS = 0.
 */
describe("T1.11 TRUSTED_PROXY_HOPS = 0 (solo local)", () => {
  it("Next.js solo rellena X-Forwarded-For si el cliente no la envía (`??=` en base-server.js)", () => {
    // Si una actualización de Next.js cambia este comportamiento, este test obliga a revisar la decisión.
    const require = createRequire(import.meta.url);
    const baseServer = readFileSync(require.resolve("next/dist/server/base-server.js"), "utf8");
    expect(baseServer).toMatch(/req\.headers\['x-forwarded-for'\] \?\?= /);
  });

  it("sin cabecera del cliente se usa la IP del socket que añade Next.js", () => {
    expect(clientIpFromForwardedFor("::ffff:127.0.0.1", 0)).toBe("127.0.0.1");
  });

  it("con cabecera del cliente, la IP es la que él declara (falsificable: por eso no vale en producción)", () => {
    expect(clientIpFromForwardedFor("6.6.6.6", 0)).toBe("6.6.6.6");
    expect(clientIpFromForwardedFor("9.9.9.9, 6.6.6.6", 0)).toBe("6.6.6.6");
  });

  it("una cabecera malformada sigue dando unknown", () => {
    expect(clientIpFromForwardedFor("<script>", 0)).toBe(UNKNOWN_CLIENT_IP);
  });
});
