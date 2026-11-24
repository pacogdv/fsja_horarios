// @vitest-environment node
/**
 * T1.12 — Caso de uso de login (pasos 2 a 9 de specs/02-architecture-plan.md §5.2), con fakes de los puertos.
 * Refs: ADR-0002, ADR-0008; CLAUDE.md §3.1.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  FakeAuditLog,
  FakeClock,
  FakePasswordHasher,
  FakeRateLimiter,
  FakeSessionStore,
  FakeUserRepository,
  fakeRateLimitKeys,
} from "../../../test/fakes/auth";
import {
  ACCOUNT_LOCK_MS,
  INVALID_CREDENTIALS_MESSAGE,
  LOGIN_RATE_LIMITS,
  type LoginRequest,
  type LoginResult,
  makeLogin,
  MAX_FAILED_LOGINS,
  RATE_LIMIT_MAX_WINDOW_SECONDS,
} from "./login";

const PASSWORD = "Contraseña-Correcta-123";
const EMAIL = "ana@centro.example";
const IP = "203.0.113.7";

let clock: FakeClock;
let users: FakeUserRepository;
let hasher: FakePasswordHasher;
let sessions: FakeSessionStore;
let rateLimiter: FakeRateLimiter;
let auditLog: FakeAuditLog;
let login: (request: LoginRequest) => Promise<LoginResult>;

const request = (overrides: Partial<LoginRequest> = {}): LoginRequest => ({
  email: EMAIL,
  password: PASSWORD,
  ip: IP,
  userAgent: "Firefox",
  previousSessionToken: null,
  ...overrides,
});

const INVALID_CREDENTIALS: LoginResult = { ok: false, error: "INVALID_CREDENTIALS", message: INVALID_CREDENTIALS_MESSAGE };

beforeEach(() => {
  clock = new FakeClock();
  users = new FakeUserRepository();
  hasher = new FakePasswordHasher();
  sessions = new FakeSessionStore(clock);
  rateLimiter = new FakeRateLimiter();
  auditLog = new FakeAuditLog();
  login = makeLogin({ users, hasher, sessions, rateLimiter, rateLimitKeys: fakeRateLimitKeys, auditLog, clock });
  users.add({ id: "u-ana", email: EMAIL, passwordHash: `argon2:${PASSWORD}`, role: "DOCENTE" });
});

describe("T1.12 login correcto [02 §5.2, pasos 7-9]", () => {
  it("crea la sesión y devuelve el token, su caducidad y el usuario", async () => {
    const result = await login(request());
    expect(result).toEqual({
      ok: true,
      sessionToken: "token-1",
      sessionExpiresAt: new Date("2026-11-24T16:00:00.000Z"),
      userId: "u-ana",
      role: "DOCENTE",
    });
    expect(sessions.created).toEqual([{ userId: "u-ana", ip: IP, userAgent: "Firefox" }]);
  });

  it("normaliza el correo (trim + minúsculas) antes de buscar al usuario [paso 3]", async () => {
    expect((await login(request({ email: "  ANA@Centro.Example " }))).ok).toBe(true);
    expect(users.lookups).toEqual([EMAIL]);
  });

  it("reinicia los fallos y registra la fecha del último login", async () => {
    users.users.get("u-ana")!.failedLoginCount = 3;
    await login(request());
    expect(users.users.get("u-ana")).toMatchObject({ failedLoginCount: 0, lastLoginAt: clock.now() });
  });

  it("revoca la sesión previa del navegador antes de crear la nueva (fijación de sesión) [paso 7]", async () => {
    sessions.seed("token-previo", "u-otro");
    await login(request({ previousSessionToken: "token-previo" }));
    expect(sessions.revoked).toEqual(["token-previo"]);
    expect(sessions.calls.indexOf("revoke")).toBeLessThan(sessions.calls.indexOf("create"));
  });

  it("sin sesión previa no revoca nada", async () => {
    await login(request());
    expect(sessions.revoked).toEqual([]);
  });

  it("tras el login purga sesiones caducadas y contadores antiguos (ADR-0002, ADR-0008)", async () => {
    await login(request());
    expect(sessions.purgeCount).toBe(1);
    expect(rateLimiter.purges).toEqual([RATE_LIMIT_MAX_WINDOW_SECONDS]);
    expect(RATE_LIMIT_MAX_WINDOW_SECONDS).toBe(60 * 60); // la ventana más larga de 02 §5.6
  });

  it("registra el login correcto en audit_log [paso 9]", async () => {
    await login(request());
    expect(auditLog.entries).toEqual([
      { action: "auth.login.succeeded", userId: "u-ana", entityType: "app_user", entityId: "u-ana", metadata: { ip: IP } },
    ]);
  });
});

describe("T1.12 rate limiting, antes de cualquier trabajo [02 §5.2 paso 2, §5.6]", () => {
  const ipKey = `login:ip:${IP}`;
  const ipEmailKey = `login:ip-email:${IP}:${EMAIL}`;

  it("5 / 15 min por (ip, correo) y 20 / 15 min por ip", () => {
    expect(LOGIN_RATE_LIMITS).toEqual({
      perIpAndEmail: { limit: 5, windowSeconds: 15 * 60 },
      perIp: { limit: 20, windowSeconds: 15 * 60 },
    });
  });

  it("el límite por (ip, correo) cuenta todos los intentos; el de ip solo se consulta", async () => {
    await login(request());
    expect(rateLimiter.consumed).toEqual([{ key: ipEmailKey, rule: LOGIN_RATE_LIMITS.perIpAndEmail }]);
    expect(rateLimiter.peeked).toEqual([{ key: ipKey, rule: LOGIN_RATE_LIMITS.perIp }]);
  });

  it("un login fallido suma al límite por ip", async () => {
    await login(request({ password: "incorrecta" }));
    expect(rateLimiter.consumed.map((entry) => entry.key)).toEqual([ipEmailKey, ipKey]);
  });

  it("un claustro tras la misma IP (NAT) puede entrar: 30 logins correctos seguidos no agotan el límite por ip", async () => {
    for (let index = 0; index < 30; index += 1) {
      const email = `docente${index}@centro.example`;
      users.add({ id: `u-${index}`, email, passwordHash: `argon2:${PASSWORD}` });
      expect((await login(request({ email }))).ok).toBe(true);
    }
  });

  it("tras 20 fallos desde una IP, el siguiente intento (aunque sea de otra persona y correcto) se limita", async () => {
    for (let index = 0; index < 20; index += 1) {
      await login(request({ email: `atacado${index}@centro.example`, password: "incorrecta" }));
    }
    expect(await login(request())).toEqual({
      ok: false,
      error: "RATE_LIMITED",
      retryAfterSeconds: FakeRateLimiter.RETRY_AFTER_SECONDS,
    });
  });

  it.each([
    ["(ip, correo)", `login:ip-email:${IP}:${EMAIL}`],
    ["ip", `login:ip:${IP}`],
  ])("si se supera el límite por %s, responde RATE_LIMITED sin buscar al usuario ni verificar", async (_case, key) => {
    rateLimiter.decisions.set(key, { allowed: false, retryAfterSeconds: 120 });
    expect(await login(request())).toEqual({ ok: false, error: "RATE_LIMITED", retryAfterSeconds: 120 });
    expect(users.lookups).toEqual([]);
    expect(hasher.verifyCalls).toEqual([]);
  });

  it("si se superan los dos límites, informa del mayor tiempo de espera", async () => {
    rateLimiter.decisions.set(`login:ip-email:${IP}:${EMAIL}`, { allowed: false, retryAfterSeconds: 60 });
    rateLimiter.decisions.set(`login:ip:${IP}`, { allowed: false, retryAfterSeconds: 300 });
    expect(await login(request())).toEqual({ ok: false, error: "RATE_LIMITED", retryAfterSeconds: 300 });
  });

  it("también limita las peticiones con datos inválidos (el límite va primero)", async () => {
    await login(request({ email: 42, password: undefined }));
    expect(rateLimiter.consumed.map((entry) => entry.key)).toEqual([`login:ip-email:${IP}:`]);
    expect(rateLimiter.peeked.map((entry) => entry.key)).toEqual([ipKey]);
  });
});

describe("T1.12 validación Zod [02 §5.2 paso 3, §5.4]", () => {
  it.each([
    ["correo mal formado", { email: "no-es-un-correo" }, ["email"]],
    ["correo vacío", { email: "" }, ["email"]],
    ["correo de más de 254 caracteres", { email: `${"a".repeat(250)}@x.es` }, ["email"]],
    ["contraseña vacía", { password: "" }, ["password"]],
    ["contraseña de más de 256 caracteres", { password: "p".repeat(257) }, ["password"]],
    ["campos que no son texto", { email: 1, password: ["x"] }, ["email", "password"]],
  ])("rechaza %s con INVALID_INPUT sin buscar al usuario", async (_case, overrides, fields) => {
    const result = await login(request(overrides as Partial<LoginRequest>));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("INVALID_INPUT");
    expect(Object.keys(result.ok === false && result.error === "INVALID_INPUT" ? result.fieldErrors : {}).sort()).toEqual(fields);
    expect(users.lookups).toEqual([]);
  });

  it("admite una contraseña de 256 caracteres", async () => {
    const long = "p".repeat(256);
    users.users.get("u-ana")!.passwordHash = `argon2:${long}`;
    expect((await login(request({ password: long }))).ok).toBe(true);
  });

  it("los mensajes de validación no repiten los valores recibidos", async () => {
    const result = await login(request({ email: "secreto-no-es-un-correo", password: "" }));
    expect(JSON.stringify(result)).not.toContain("secreto-no-es-un-correo");
  });
});

describe("T1.12 respuesta genérica: no se puede enumerar usuarios [02 §5.2 pasos 4-6]", () => {
  it("con un usuario inexistente se llama igualmente a verify, con un hash ficticio", async () => {
    await login(request({ email: "nadie@centro.example" }));
    expect(hasher.verifyCalls).toHaveLength(1);
    expect(hasher.verifyCalls[0]?.password).toBe(PASSWORD);
    // El hash ficticio se genera con el propio hasher: mismos parámetros, mismo coste.
    expect(hasher.hashCalls).toHaveLength(1);
    expect(hasher.verifyCalls[0]?.passwordHash).toBe(`argon2:${hasher.hashCalls[0]}`);
  });

  it("el hash ficticio se genera una sola vez", async () => {
    await login(request({ email: "nadie@centro.example" }));
    await login(request({ email: "otro@centro.example" }));
    expect(hasher.hashCalls).toHaveLength(1);
  });

  it("usuario inexistente y contraseña incorrecta dan exactamente la misma respuesta", async () => {
    const unknownUser = await login(request({ email: "nadie@centro.example" }));
    const wrongPassword = await login(request({ password: "incorrecta" }));
    expect(unknownUser).toEqual(INVALID_CREDENTIALS);
    expect(wrongPassword).toEqual(unknownUser);
    expect(INVALID_CREDENTIALS_MESSAGE).toBe("Credenciales no válidas");
  });

  it("un usuario desactivado recibe la misma respuesta, aunque la contraseña sea correcta", async () => {
    users.users.get("u-ana")!.isActive = false;
    expect(await login(request())).toEqual(INVALID_CREDENTIALS);
    expect(sessions.created).toEqual([]);
  });
});

describe("T1.12 bloqueo tras 10 fallos [02 §5.2 paso 6, ADR-0002]", () => {
  // Cada intento desde una IP distinta: aquí se prueba el bloqueo de la cuenta, no el límite de peticiones.
  let attempts = 0;
  const failTimes = async (times: number) => {
    for (let attempt = 0; attempt < times; attempt += 1) {
      attempts += 1;
      await login(request({ password: "incorrecta", ip: `198.51.100.${attempts}` }));
    }
  };

  it("10 fallos y 15 minutos", () => {
    expect(MAX_FAILED_LOGINS).toBe(10);
    expect(ACCOUNT_LOCK_MS).toBe(15 * 60_000);
  });

  it("cada fallo se cuenta; al 10.º se bloquea 15 min y el contador vuelve a 0 (no se acumula)", async () => {
    await failTimes(9);
    expect(users.users.get("u-ana")).toMatchObject({ failedLoginCount: 9, lockedUntil: null });
    await failTimes(1);
    expect(users.users.get("u-ana")).toMatchObject({
      failedLoginCount: 0,
      lockedUntil: new Date(clock.now().getTime() + ACCOUNT_LOCK_MS),
    });
  });

  it("el bloqueo se registra en audit_log", async () => {
    await failTimes(10);
    expect(auditLog.actions().filter((action) => action === "auth.account.locked")).toHaveLength(1);
    expect(auditLog.entries.at(-1)).toMatchObject({ action: "auth.account.locked", userId: "u-ana", entityId: "u-ana" });
  });

  it("con la cuenta bloqueada, la contraseña correcta recibe la misma respuesta que una incorrecta", async () => {
    await failTimes(10);
    const wrongPassword = await login(request({ password: "incorrecta" }));
    const lockedButCorrect = await login(request());
    expect(lockedButCorrect).toEqual(INVALID_CREDENTIALS);
    expect(lockedButCorrect).toEqual(wrongPassword);
    expect(sessions.created).toEqual([]);
  });

  it("con la cuenta bloqueada se sigue verificando (mismo tiempo de respuesta) y los intentos no suman fallos", async () => {
    await failTimes(10);
    const verifications = hasher.verifyCalls.length;
    await failTimes(3);
    expect(hasher.verifyCalls.length).toBe(verifications + 3);
    expect(users.users.get("u-ana")?.failedLoginCount).toBe(0);
  });

  it("pasados los 15 minutos se puede volver a entrar", async () => {
    await failTimes(10);
    clock.advance(ACCOUNT_LOCK_MS);
    expect((await login(request())).ok).toBe(true);
    expect(users.users.get("u-ana")?.lockedUntil).toBeNull();
  });
});

describe("T1.12 rehash de hashes obsoletos [02 §5.2 paso 5]", () => {
  it("tras un login correcto con un hash obsoleto, lo sustituye por uno nuevo", async () => {
    users.users.get("u-ana")!.passwordHash = `legacy:${PASSWORD}`;
    expect((await login(request())).ok).toBe(true);
    expect(users.users.get("u-ana")?.passwordHash).toBe(`argon2:${PASSWORD}`);
  });

  it("no rehashea si el hash está al día ni si el login falla", async () => {
    await login(request());
    users.users.get("u-ana")!.passwordHash = `legacy:${PASSWORD}`;
    await login(request({ password: "incorrecta" }));
    expect(hasher.hashCalls).toEqual([]);
    expect(users.users.get("u-ana")?.passwordHash).toBe(`legacy:${PASSWORD}`);
  });
});

describe("T1.12 auditoría sin contraseñas [CLAUDE.md §3.1, §3.4]", () => {
  it("registra cada fallo con su motivo interno, que nunca llega a la respuesta", async () => {
    await login(request({ email: "nadie@centro.example" }));
    await login(request({ password: "incorrecta" }));
    users.users.get("u-ana")!.isActive = false;
    await login(request());
    expect(auditLog.entries.map(({ action, userId, metadata }) => ({ action, userId, metadata }))).toEqual([
      { action: "auth.login.failed", userId: null, metadata: { ip: IP, reason: "unknown-user" } },
      { action: "auth.login.failed", userId: "u-ana", metadata: { ip: IP, reason: "wrong-password" } },
      { action: "auth.login.failed", userId: "u-ana", metadata: { ip: IP, reason: "inactive" } },
    ]);
  });

  it("ni la contraseña ni el correo tecleado aparecen en audit_log", async () => {
    await login(request());
    await login(request({ password: "incorrecta-secreta" }));
    await login(request({ email: "tecleado@centro.example", password: "secreta-en-otra-cuenta" }));
    const recorded = JSON.stringify(auditLog.entries);
    for (const secret of [PASSWORD, "incorrecta-secreta", "secreta-en-otra-cuenta", "tecleado@centro.example", EMAIL]) {
      expect(recorded).not.toContain(secret);
    }
  });

  it("no hay auditoría ni sesión si la petición se rechaza por límite o por datos inválidos", async () => {
    await login(request({ email: "no-es-un-correo" }));
    rateLimiter.decisions.set(`login:ip:${IP}`, { allowed: false, retryAfterSeconds: 1 });
    await login(request());
    expect(auditLog.entries).toEqual([]);
    expect(sessions.created).toEqual([]);
  });
});
