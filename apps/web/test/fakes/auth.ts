/**
 * Fakes en memoria de los puertos de autenticación, para probar los casos de uso sin BD (specs/03-tasks.md
 * T1.12). Registran las llamadas para que los tests comprueben el orden y los argumentos.
 */
import type { AuditEntry, AuditLog } from "@/application/ports/audit-log";
import type { Clock } from "@/application/ports/clock";
import type { PasswordHasher } from "@/application/ports/password-hasher";
import type { RateLimitDecision, RateLimiter, RateLimitKeys, RateLimitRule } from "@/application/ports/rate-limiter";
import type { NewSessionInput, Session, SessionStore } from "@/application/ports/session-store";
import type { Principal, UserCredentials, UserRepository } from "@/application/ports/user-repository";

export class FakeClock implements Clock {
  constructor(private current = new Date("2026-11-24T08:00:00.000Z")) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

/** `hash(p)` = `argon2:p`. Los hashes que empiezan por `legacy:` necesitan rehash. */
export class FakePasswordHasher implements PasswordHasher {
  readonly verifyCalls: { password: string; passwordHash: string }[] = [];
  readonly hashCalls: string[] = [];
  async hash(password: string): Promise<string> {
    this.hashCalls.push(password);
    return `argon2:${password}`;
  }
  async verify(password: string, passwordHash: string): Promise<boolean> {
    this.verifyCalls.push({ password, passwordHash });
    return passwordHash === `argon2:${password}` || passwordHash === `legacy:${password}`;
  }
  needsRehash(passwordHash: string): boolean {
    return passwordHash.startsWith("legacy:");
  }
}

/** Copia mutable del usuario: los tests cambian su estado directamente. */
type StoredUser = { -readonly [Field in keyof UserCredentials]: UserCredentials[Field] } & {
  email: string;
  displayName: string;
  lastLoginAt: Date | null;
  teacherId: string | null;
  taughtClassGroupIds: string[];
};

export class FakeUserRepository implements UserRepository {
  readonly users = new Map<string, StoredUser>();
  readonly lookups: string[] = [];

  add(user: Partial<StoredUser> & Pick<StoredUser, "id" | "email" | "passwordHash">): StoredUser {
    const stored: StoredUser = {
      role: "DOCENTE",
      isActive: true,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      displayName: user.email,
      teacherId: null,
      taughtClassGroupIds: [],
      ...user,
    };
    this.users.set(stored.id, stored);
    return stored;
  }

  private byId(userId: string): StoredUser {
    const user = this.users.get(userId);
    if (!user) throw new Error(`usuario ${userId} no existe`);
    return user;
  }

  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    this.lookups.push(email);
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) return { ...user };
    }
    return null;
  }
  async findPrincipal(userId: string): Promise<Principal | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    return {
      role: user.role,
      isActive: user.isActive,
      displayName: user.displayName,
      teacherId: user.teacherId,
      taughtClassGroupIds: new Set(user.taughtClassGroupIds),
    };
  }
  async recordFailedLogin(userId: string): Promise<number> {
    const user = this.byId(userId);
    user.failedLoginCount += 1;
    return user.failedLoginCount;
  }
  async lockUntil(userId: string, until: Date): Promise<void> {
    const user = this.byId(userId);
    user.lockedUntil = until;
    user.failedLoginCount = 0;
  }
  async recordSuccessfulLogin(userId: string, at: Date): Promise<void> {
    const user = this.byId(userId);
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.lastLoginAt = at;
  }
  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    this.byId(userId).passwordHash = passwordHash;
  }
}

export class FakeSessionStore implements SessionStore {
  readonly created: NewSessionInput[] = [];
  readonly revoked: string[] = [];
  readonly calls: string[] = [];
  purgeCount = 0;
  private sessions = new Map<string, Session>();

  constructor(private readonly clock: Clock) {}

  async create(input: NewSessionInput) {
    this.calls.push("create");
    this.created.push(input);
    const token = `token-${this.created.length}`;
    const now = this.clock.now().getTime();
    const session: Session = {
      id: `session-${this.created.length}`,
      userId: input.userId,
      expiresAt: new Date(now + 8 * 3_600_000),
      idleExpiresAt: new Date(now + 30 * 60_000),
    };
    this.sessions.set(token, session);
    return { token, session };
  }
  async findValid(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }
  async revoke(token: string): Promise<void> {
    this.calls.push("revoke");
    this.revoked.push(token);
    this.sessions.delete(token);
  }
  async revokeAllForUser(): Promise<void> {}
  async purgeExpired(): Promise<number> {
    this.calls.push("purge");
    this.purgeCount += 1;
    return 0;
  }
  /** Sesión existente (p. ej. la previa del navegador). */
  seed(token: string, userId: string): void {
    this.sessions.set(token, { id: `seeded-${token}`, userId, expiresAt: new Date(), idleExpiresAt: new Date() });
  }
}

/** Limitador en memoria que cuenta de verdad (sin ventanas). `decisions` fuerza la respuesta de una clave. */
export class FakeRateLimiter implements RateLimiter {
  static readonly RETRY_AFTER_SECONDS = 60;
  readonly consumed: { key: string; rule: RateLimitRule }[] = [];
  readonly peeked: { key: string; rule: RateLimitRule }[] = [];
  readonly purges: number[] = [];
  readonly decisions = new Map<string, RateLimitDecision>();
  private readonly counts = new Map<string, number>();

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    this.consumed.push({ key, rule });
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return this.decisions.get(key) ?? this.decide(rule.limit - count, rule);
  }
  async peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    this.peeked.push({ key, rule });
    return this.decisions.get(key) ?? this.decide(rule.limit - (this.counts.get(key) ?? 0) - 1, rule);
  }
  private decide(remaining: number, rule: RateLimitRule): RateLimitDecision {
    return remaining >= 0
      ? { allowed: true, remaining: Math.min(remaining, rule.limit) }
      : { allowed: false, retryAfterSeconds: FakeRateLimiter.RETRY_AFTER_SECONDS };
  }
  async purgeExpired(maxWindowSeconds: number): Promise<number> {
    this.purges.push(maxWindowSeconds);
    return 0;
  }
}

export const fakeRateLimitKeys: RateLimitKeys = {
  loginByIp: (ip) => `login:ip:${ip}`,
  loginByIpAndEmail: (ip, email) => `login:ip-email:${ip}:${email.trim().toLowerCase()}`,
};

export class FakeAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
  actions(): string[] {
    return this.entries.map((entry) => entry.action);
  }
}
