/**
 * Puerto del repositorio de usuarios para la autenticación (specs/02-architecture-plan.md §2.2 y §5.2).
 */
import type { Role } from "@/domain/access/role";

/** Lo mínimo para decidir un login: ni el correo ni los datos de perfil. */
export interface UserCredentials {
  readonly id: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly isActive: boolean;
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
}

/** Lo que necesitan las guardas para autorizar una petición (02 §5.3) y la barra superior (02 §6.3). */
export interface Principal {
  readonly role: Role;
  readonly isActive: boolean;
  /** Nombre visible en la interfaz (`app_user.display_name`). */
  readonly displayName: string;
  /** Docente vinculado (`teacher.user_id`); `null` si el usuario no es docente. */
  readonly teacherId: string | null;
  /** Grupos a los que da clase en el horario vigente (P-04). */
  readonly taughtClassGroupIds: ReadonlySet<string>;
}

export interface UserRepository {
  /** Usuario de una sesión, o `null` si ya no existe. */
  findPrincipal(userId: string): Promise<Principal | null>;
  /** Busca por correo normalizado (la columna es `citext`). */
  findCredentialsByEmail(email: string): Promise<UserCredentials | null>;
  /** Suma un fallo de forma atómica y devuelve el nuevo número de fallos consecutivos. */
  recordFailedLogin(userId: string): Promise<number>;
  /** Bloquea hasta `until` y reinicia el contador: el bloqueo no se acumula. */
  lockUntil(userId: string, until: Date): Promise<void>;
  /** Reinicia fallos y bloqueo y guarda la fecha del login. */
  recordSuccessfulLogin(userId: string, at: Date): Promise<void>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
}
