/**
 * Types liés à l'authentification et à l'audit, utilisés par les middlewares.
 */

/** Utilisateur authentifié attaché à la requête par le middleware `authenticate`. */
export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
  /** Identifiant du dossier patient associé (comptes patients uniquement). */
  patientId: number | null;
  /** Identifiant du profil médecin associé (comptes médecins uniquement). */
  doctorId: number | null;
}

/** Charge utile d'audit préparée par un contrôleur et écrite en fin de requête. */
export interface AuditPayload {
  action: string;
  resource: string;
  resourceId?: string | number | null;
  oldValue?: unknown;
  newValue?: unknown;
}

/** Ligne insérée dans `audit_logs`. */
export interface AuditEntry {
  userId?: number | null;
  action: string;
  resource: string;
  resourceId?: string | number | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Contexte technique d'une requête, réutilisé dans les journaux d'audit. */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  userId: number | null;
}
