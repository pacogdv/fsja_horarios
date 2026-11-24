/**
 * Claves del rate limiting (specs/02-architecture-plan.md §5.6; ADR-0008).
 *
 * Llevan un prefijo por operación y no contienen datos personales en claro: el correo y la IP (dato personal
 * según el RGPD) se seudonimizan con HMAC-SHA256(RATE_LIMIT_KEY_SECRET, "<tipo>:<valor>"). Un hash sin
 * clave se podría revertir probando un diccionario de correos del centro o el espacio de direcciones IPv4.
 * El prefijo de tipo separa los dominios: una IP y un correo con el mismo texto no comparten seudónimo.
 */
import { createHmac } from "node:crypto";

const SECRET_MIN_LENGTH = 32;

/** Misma normalización que el login (02 §5.2, paso 3): sin espacios alrededor y en minúsculas. */
const normalizedEmail = (email: string) => email.trim().toLowerCase();

export interface RateLimitKeys {
  loginByIp(ip: string): string;
  loginByIpAndEmail(ip: string, email: string): string;
}

export function createRateLimitKeys(secret: string): RateLimitKeys {
  if (secret.length < SECRET_MIN_LENGTH) {
    throw new RangeError(`RATE_LIMIT_KEY_SECRET debe tener al menos ${SECRET_MIN_LENGTH} caracteres`);
  }
  const pseudonym = (kind: "ip" | "email", value: string) =>
    createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
  const ipPseudonym = (ip: string) => pseudonym("ip", ip);
  const emailPseudonym = (email: string) => pseudonym("email", normalizedEmail(email));

  return Object.freeze({
    loginByIp: (ip: string) => `login:ip:${ipPseudonym(ip)}`,
    loginByIpAndEmail: (ip: string, email: string) => `login:ip-email:${ipPseudonym(ip)}:${emailPseudonym(email)}`,
  });
}
