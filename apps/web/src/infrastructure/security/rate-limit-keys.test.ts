// @vitest-environment node
/**
 * T1.11 — Claves del rate limiting sin datos personales en claro (specs/02-architecture-plan.md §5.6; ADR-0008).
 */
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRateLimitKeys } from "./rate-limit-keys";

const SECRET = "s".repeat(32);
const EMAIL = "ana.garcia@centro.example";
const keys = createRateLimitKeys(SECRET);

const hex = (algorithm: "sha256", value: string) => createHash(algorithm).update(value).digest("hex");

const pseudonym = (kind: "ip" | "email", value: string) =>
  createHmac("sha256", SECRET).update(`${kind}:${value}`).digest("hex");

describe("T1.11 claves de rate limiting", () => {
  it("login por IP: prefijo de operación y la IP seudonimizada con HMAC (la IP es un dato personal)", () => {
    expect(keys.loginByIp("1.2.3.4")).toBe(`login:ip:${pseudonym("ip", "1.2.3.4")}`);
    expect(keys.loginByIp("unknown")).toBe(`login:ip:${pseudonym("ip", "unknown")}`);
  });

  it("login por (IP, correo): ambos como HMAC-SHA256(RATE_LIMIT_KEY_SECRET, …), con el correo normalizado", () => {
    expect(keys.loginByIpAndEmail("1.2.3.4", EMAIL)).toBe(
      `login:ip-email:${pseudonym("ip", "1.2.3.4")}:${pseudonym("email", EMAIL)}`,
    );
  });

  it.each(["203.0.113.7", "2001:db8::1"])("ninguna clave contiene la IP en claro (%s) [02 §5.6]", (ip) => {
    expect(keys.loginByIp(ip)).not.toContain(ip);
    expect(keys.loginByIpAndEmail(ip, EMAIL)).not.toContain(ip);
  });

  it("una IP y un correo con el mismo texto no producen el mismo seudónimo (separación por tipo)", () => {
    expect(keys.loginByIp("x")).not.toContain(pseudonym("email", "x"));
  });

  it("la clave no contiene el correo, su parte local ni su SHA-256 sin clave (revertible con un diccionario)", () => {
    const key = keys.loginByIpAndEmail("1.2.3.4", EMAIL);
    for (const leaked of [EMAIL, "ana.garcia", "centro.example", hex("sha256", EMAIL), hex("sha256", EMAIL.toUpperCase())]) {
      expect(key).not.toContain(leaked);
    }
  });

  it("normaliza el correo (espacios y mayúsculas) como el login [02 §5.2]: misma persona, misma clave", () => {
    expect(keys.loginByIpAndEmail("1.2.3.4", "  Ana.Garcia@CENTRO.example ")).toBe(keys.loginByIpAndEmail("1.2.3.4", EMAIL));
  });

  it("con otro secreto, la misma persona tiene otra clave", () => {
    const other = createRateLimitKeys("o".repeat(32));
    expect(other.loginByIpAndEmail("1.2.3.4", EMAIL)).not.toBe(keys.loginByIpAndEmail("1.2.3.4", EMAIL));
  });

  it("IP y correo distintos dan claves distintas", () => {
    const base = keys.loginByIpAndEmail("1.2.3.4", EMAIL);
    expect(keys.loginByIpAndEmail("1.2.3.5", EMAIL)).not.toBe(base);
    expect(keys.loginByIpAndEmail("1.2.3.4", "otra@centro.example")).not.toBe(base);
  });

  it.each(["", "corto"])("rechaza un secreto de menos de 32 caracteres (%j)", (secret) => {
    expect(() => createRateLimitKeys(secret)).toThrow(RangeError);
  });
});
