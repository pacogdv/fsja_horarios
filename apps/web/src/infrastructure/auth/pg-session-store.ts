/**
 * Almacén de sesiones opacas en PostgreSQL (specs/02-architecture-plan.md §5.2; ADR-0002).
 *
 * - Token: 32 bytes de `crypto.randomBytes`, en base64url en la cookie. En `user_session` solo se guarda el
 *   SHA-256 de esos bytes: una fuga de la BD no permite suplantar sesiones.
 * - Caducidad absoluta de 8 h y por inactividad de 30 min. La inactividad se renueva como máximo cada 5 min
 *   (la última renovación se deduce de `idle_expires_at`), sin superar nunca la absoluta.
 * - Un token con formato inválido se rechaza sin consultar la BD.
 */
import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import type { Clock } from "@/application/ports/clock";
import type { NewSessionInput, Session, SessionStore } from "@/application/ports/session-store";
import type { DatabaseClient } from "@/infrastructure/db/prisma-client";

const MINUTE_MS = 60_000;
export const SESSION_ABSOLUTE_TTL_MS = 8 * 60 * MINUTE_MS;
export const SESSION_IDLE_TTL_MS = 30 * MINUTE_MS;
export const SESSION_RENEWAL_INTERVAL_MS = 5 * MINUTE_MS;

const TOKEN_BYTES = 32;
/** 32 bytes en base64url sin relleno: 43 caracteres. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const USER_AGENT_MAX_LENGTH = 512;

const SESSION_FIELDS = { id: true, userId: true, expiresAt: true, idleExpiresAt: true } as const;

function sha256(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

/** Hash del token, o `null` si no tiene el formato de un token emitido por este almacén. */
function hashToken(token: string): Uint8Array<ArrayBuffer> | null {
  if (typeof token !== "string" || !TOKEN_FORMAT.test(token)) return null;
  const raw = Buffer.from(token, "base64url");
  // Solo la codificación canónica: un mismo token no admite variantes en el último carácter.
  if (raw.length !== TOKEN_BYTES || raw.toString("base64url") !== token) return null;
  return sha256(raw);
}

/** La columna es `inet`: una IP no válida (cabecera manipulada) se descarta en lugar de provocar un error. */
function validIpOrNull(ip: string | null): string | null {
  return ip !== null && isIP(ip) !== 0 ? ip : null;
}

/** Cabecera de longitud acotada. Si el corte deja medio carácter (sustituto UTF-16 alto), se descarta. */
function truncatedUserAgent(userAgent: string | null): string | null {
  if (userAgent === null) return null;
  const cut = userAgent.slice(0, USER_AGENT_MAX_LENGTH);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

const addMs = (date: Date, milliseconds: number) => new Date(date.getTime() + milliseconds);

export class PgSessionStore implements SessionStore {
  constructor(
    private readonly db: DatabaseClient,
    private readonly clock: Clock,
  ) {}

  async create(input: NewSessionInput): Promise<{ token: string; session: Session }> {
    const raw = randomBytes(TOKEN_BYTES);
    const now = this.clock.now();
    const session = await this.db.userSession.create({
      data: {
        userId: input.userId,
        tokenHash: sha256(raw),
        expiresAt: addMs(now, SESSION_ABSOLUTE_TTL_MS),
        idleExpiresAt: addMs(now, SESSION_IDLE_TTL_MS),
        ip: validIpOrNull(input.ip),
        userAgent: truncatedUserAgent(input.userAgent),
      },
      select: SESSION_FIELDS,
    });
    return { token: raw.toString("base64url"), session };
  }

  async findValid(token: string): Promise<Session | null> {
    const tokenHash = hashToken(token);
    if (tokenHash === null) return null;

    const session = await this.db.userSession.findUnique({ where: { tokenHash }, select: SESSION_FIELDS });
    if (session === null) return null;

    const now = this.clock.now();
    if (now >= session.expiresAt || now >= session.idleExpiresAt) {
      await this.db.userSession.deleteMany({ where: { id: session.id } });
      return null;
    }

    const lastRenewal = addMs(session.idleExpiresAt, -SESSION_IDLE_TTL_MS);
    if (now.getTime() - lastRenewal.getTime() < SESSION_RENEWAL_INTERVAL_MS) return session;

    const idleExpiresAt = new Date(
      Math.min(now.getTime() + SESSION_IDLE_TTL_MS, session.expiresAt.getTime()),
    );
    // updateMany: si otra petición la borró entretanto (logout), no lanza.
    await this.db.userSession.updateMany({ where: { id: session.id }, data: { idleExpiresAt } });
    return { ...session, idleExpiresAt };
  }

  async revoke(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    if (tokenHash === null) return;
    await this.db.userSession.deleteMany({ where: { tokenHash } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.userSession.deleteMany({ where: { userId } });
  }

  async purgeExpired(): Promise<number> {
    const now = this.clock.now();
    const { count } = await this.db.userSession.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { idleExpiresAt: { lte: now } }] },
    });
    return count;
  }
}
