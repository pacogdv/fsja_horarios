/**
 * Adaptador Prisma del puerto `UserRepository` (specs/02-architecture-plan.md §2.2 y §5.2).
 */
import type { Principal, UserCredentials, UserRepository } from "@/application/ports/user-repository";
import type { DatabaseClient } from "@/infrastructure/db/prisma-client";

const CREDENTIAL_FIELDS = {
  id: true,
  passwordHash: true,
  role: true,
  isActive: true,
  failedLoginCount: true,
  lockedUntil: true,
} as const;

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findPrincipal(userId: string): Promise<Principal | null> {
    const user = await this.db.appUser.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
    if (user === null) return null;
    // El vínculo con el docente (`teacher.user_id`) llega en T3.8 y los grupos impartidos (P-04) con el
    // horario vigente (H5). Hasta entonces, ningún usuario tiene recursos "propios".
    return { ...user, teacherId: null, taughtClassGroupIds: new Set() };
  }

  findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    // `email` es citext: la comparación no distingue mayúsculas.
    return this.db.appUser.findUnique({ where: { email }, select: CREDENTIAL_FIELDS });
  }

  async recordFailedLogin(userId: string): Promise<number> {
    // `increment` se traduce en `SET failed_login_count = failed_login_count + 1`: atómico con concurrencia.
    const { failedLoginCount } = await this.db.appUser.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    return failedLoginCount;
  }

  async lockUntil(userId: string, until: Date): Promise<void> {
    await this.db.appUser.update({ where: { id: userId }, data: { lockedUntil: until, failedLoginCount: 0 } });
  }

  async recordSuccessfulLogin(userId: string, at: Date): Promise<void> {
    await this.db.appUser.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: at },
    });
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.db.appUser.update({ where: { id: userId }, data: { passwordHash } });
  }
}
