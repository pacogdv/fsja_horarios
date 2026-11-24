/**
 * IP del cliente para el rate limiting (specs/02-architecture-plan.md §5.6; ADR-0008).
 *
 * Solo se usa la cadena `X-Forwarded-For`, contando `trustedProxyHops` entradas desde la derecha: son las
 * que añaden los proxies de confianza. Las de la izquierda las controla el cliente y se ignoran, aunque
 * sean basura. Si la entrada elegida no existe o no es una IP, se devuelve `unknown`, que comparte límite.
 *
 * Con 0 saltos (solo local) se usa la última entrada. Next.js solo la rellena con la IP del socket si el
 * cliente no envía la cabecera (verificado en T1.11): es falsificable, y por eso env.ts exige ≥ 1 en
 * production.
 */
import { isIP } from "node:net";

export const UNKNOWN_CLIENT_IP = "unknown";

const MAX_TRUSTED_PROXY_HOPS = 3;
const IPV4_MAPPED_PREFIX = "::ffff:";

/** Una sola representación por dirección: IPv6 en minúsculas e IPv4 mapeada como IPv4. */
function normalizedIp(candidate: string): string | null {
  const ip = candidate.trim().toLowerCase();
  if (ip.startsWith(IPV4_MAPPED_PREFIX) && isIP(ip.slice(IPV4_MAPPED_PREFIX.length)) === 4) {
    return ip.slice(IPV4_MAPPED_PREFIX.length);
  }
  return isIP(ip) === 0 ? null : ip;
}

export function clientIpFromForwardedFor(forwardedFor: string | null | undefined, trustedProxyHops: number): string {
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 0 || trustedProxyHops > MAX_TRUSTED_PROXY_HOPS) {
    throw new RangeError(`trustedProxyHops debe ser un entero entre 0 y ${MAX_TRUSTED_PROXY_HOPS}`);
  }
  if (!forwardedFor) return UNKNOWN_CLIENT_IP;

  // Con 0 saltos, la última entrada es la que añade Next.js (si el cliente no envió la cabecera).
  const positionFromRight = Math.max(trustedProxyHops, 1);
  // Solo se separan las entradas necesarias, empezando por la derecha: la parte izquierda es del cliente.
  let end = forwardedFor.length;
  let entry: string | undefined;
  for (let position = 1; position <= positionFromRight; position += 1) {
    if (end < 0) return UNKNOWN_CLIENT_IP;
    const start = forwardedFor.lastIndexOf(",", end - 1);
    entry = forwardedFor.slice(start + 1, end);
    end = start;
  }
  return (entry !== undefined && normalizedIp(entry)) || UNKNOWN_CLIENT_IP;
}
