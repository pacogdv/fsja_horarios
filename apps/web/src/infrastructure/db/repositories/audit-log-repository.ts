/**
 * Adaptador Prisma del puerto `AuditLog` sobre `audit_log` (specs/02-architecture-plan.md §2.2).
 * El instante viene del reloj de la aplicación, igual que el resto de marcas de tiempo de los casos de uso.
 */
import type { AuditEntry, AuditLog } from "@/application/ports/audit-log";
import type { Clock } from "@/application/ports/clock";
import type { DatabaseClient } from "@/infrastructure/db/prisma-client";

export class PrismaAuditLog implements AuditLog {
  constructor(
    private readonly db: DatabaseClient,
    private readonly clock: Clock,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.auditLog.create({
      data: {
        action: entry.action,
        userId: entry.userId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: { ...entry.metadata },
        at: this.clock.now(),
      },
    });
  }
}
