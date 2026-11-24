/**
 * Puerto del registro de auditoría (`audit_log`, specs/02-architecture-plan.md §2.2).
 * Los metadatos nunca incluyen contraseñas, tokens ni datos personales innecesarios (CLAUDE.md §3.4).
 */
export type AuditMetadataValue = string | number | boolean | null;

export interface AuditEntry {
  /** Acción con espacio de nombres, p. ej. `auth.login.succeeded`. */
  readonly action: string;
  /** Usuario que realiza la acción, si se conoce. */
  readonly userId: string | null;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly metadata: Readonly<Record<string, AuditMetadataValue>>;
}

export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}
