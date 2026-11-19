/**
 * Règles métier de la gestion des utilisateurs.
 *
 * Points de vigilance :
 *  - un compte ne peut jamais être créé ou modifié sans au moins un rôle
 *    valide : les codes sont résolus en base avant toute écriture ;
 *  - la base doit toujours conserver au moins un SUPER_ADMIN actif, sans quoi
 *    plus personne ne pourrait administrer les rôles et permissions ;
 *  - toute désactivation ou réinitialisation de mot de passe révoque les
 *    jetons de rafraîchissement afin de couper immédiatement les sessions.
 * Aucune chaîne SQL dans ce fichier : tout passe par le repository.
 */

import type { CreateUserInput, Paginated, UpdateUserInput, User } from '@mediclinic/shared';

import { env } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';
import { paginated, type Pagination } from '../../utils/pagination.js';
import { revokeAllRefreshTokens, updatePasswordHash } from '../auth/auth.repository.js';
import { hashPassword } from '../auth/auth.service.js';
import * as repository from './users.repository.js';
import type { UserRecord } from './users.repository.js';

/** Rôle dont la disparition priverait la clinique de tout administrateur. */
const SUPER_ADMIN_CODE = 'SUPER_ADMIN';

/** Filtres de lecture d'une page de la liste des utilisateurs. */
export interface UserListFilters {
  search?: string;
  role?: string;
  isActive?: boolean;
  sort?: string;
  order?: 'asc' | 'desc';
}

/** Résultat d'une modification : la nouvelle fiche et l'ancienne, pour l'audit. */
export interface UpdateUserResult {
  user: User;
  previous: User;
}

/** Rôles et permissions effectifs d'un utilisateur (écran d'administration). */
export interface UserPermissions {
  userId: number;
  roles: string[];
  permissions: string[];
}

/** Découpe un `GROUP_CONCAT` (`,`) en tableau de valeurs non vides. */
function splitList(value: string | null): string[] {
  return value ? value.split(',').filter((item) => item.length > 0) : [];
}

/**
 * Normalise une date MySQL en chaîne `'AAAA-MM-JJ HH:MM:SS'`.
 * Le pilote renvoie déjà des chaînes (`dateStrings: true`) ; le cas `Date` est
 * couvert par sécurité afin de ne jamais exposer un format non conforme.
 */
function toDateTime(value: string | Date | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  return String(value).slice(0, 19).replace('T', ' ');
}

/** Convertit une ligne SQL en objet `User` exposé par l'API. */
export function toUser(record: UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    first_name: record.first_name,
    last_name: record.last_name,
    phone: record.phone,
    is_active: Boolean(record.is_active),
    last_login_at: toDateTime(record.last_login_at),
    created_at: toDateTime(record.created_at) ?? '',
    roles: splitList(record.roles),
    permissions: splitList(record.permissions),
    patient_id: record.patient_id,
    doctor_id: record.doctor_id,
  };
}

/** Charge une fiche utilisateur et échoue en 404 si elle n'existe pas. */
async function requireUser(id: number): Promise<UserRecord> {
  const record = await repository.findUserById(id);
  if (!record) throw AppError.notFound('Utilisateur introuvable.', 'USER_NOT_FOUND');
  return record;
}

/**
 * Résout des codes de rôle en identifiants.
 * Un code inconnu est refusé en 422 : mieux vaut une erreur explicite qu'un
 * compte créé avec des droits silencieusement incomplets.
 */
async function resolveRoleIds(codes: readonly string[]): Promise<number[]> {
  const unique = [...new Set(codes)];
  const rows = await repository.findRolesByCodes(unique);
  const idsByCode = new Map(rows.map((row) => [row.code, row.id]));

  const ids: number[] = [];
  const unknown: string[] = [];
  for (const code of unique) {
    const roleId = idsByCode.get(code);
    if (roleId === undefined) {
      unknown.push(code);
      continue;
    }
    ids.push(roleId);
  }

  if (unknown.length > 0) {
    throw AppError.unprocessable(
      `Rôle(s) inconnu(s) : ${unknown.join(', ')}. Vérifiez le référentiel des rôles.`,
      'ROLE_NOT_FOUND',
      { unknownRoleCodes: unknown },
    );
  }

  return ids;
}

/**
 * Refuse une opération qui laisserait la base sans SUPER_ADMIN actif.
 * À n'appeler que lorsque l'opération retire effectivement ce rôle ou
 * désactive le compte concerné.
 */
async function assertNotLastActiveSuperAdmin(): Promise<void> {
  const remaining = await repository.countActiveUsersWithRole(SUPER_ADMIN_CODE);
  if (remaining <= 1) {
    throw AppError.conflict(
      'Impossible de désactiver ou de déclasser le dernier SUPER_ADMIN actif : ' +
        'la clinique perdrait tout administrateur.',
      'LAST_SUPER_ADMIN',
      { activeSuperAdmins: remaining },
    );
  }
}

/** Liste paginée des utilisateurs, rôles et permissions inclus. */
export async function listUsers(
  filters: UserListFilters,
  pagination: Pagination,
): Promise<Paginated<User>> {
  const { rows, total } = await repository.findUsers({
    ...filters,
    limit: pagination.limit,
    offset: pagination.offset,
  });

  return paginated(rows.map(toUser), total, pagination);
}

/** Fiche complète d'un utilisateur (rôles et permissions effectifs). */
export async function getUser(id: number): Promise<User> {
  return toUser(await requireUser(id));
}

/** Profil de l'utilisateur connecté (même fiche que `getUser`). */
export async function getProfile(userId: number): Promise<User> {
  return getUser(userId);
}

/** Rôles et permissions effectifs d'un utilisateur, pour l'écran d'administration. */
export async function getUserPermissions(id: number): Promise<UserPermissions> {
  const user = toUser(await requireUser(id));
  return { userId: user.id, roles: user.roles, permissions: user.permissions };
}

/**
 * Crée un compte utilisateur et lui attribue ses rôles.
 * @throws AppError 409 si l'email est déjà utilisé, 422 si un code de rôle est inconnu.
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  const existing = await repository.findUserByEmail(input.email);
  if (existing) {
    throw AppError.conflict('Un compte utilise déjà cet email.', 'EMAIL_ALREADY_USED');
  }

  const roleIds = await resolveRoleIds(input.roleCodes);
  const passwordHash = await hashPassword(input.password);

  const userId = await repository.createUser(
    {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      isActive: input.isActive,
    },
    roleIds,
  );

  return toUser(await requireUser(userId));
}

/**
 * Met à jour partiellement un compte.
 * Si `roleCodes` est fourni, les rôles sont remplacés intégralement.
 * @throws AppError 404 si absent, 409 si l'email est pris ou si l'acteur
 *         désactive son propre compte, 422 si un code de rôle est inconnu.
 */
export async function updateUser(
  id: number,
  input: UpdateUserInput,
  actorId: number,
): Promise<UpdateUserResult> {
  const record = await requireUser(id);
  const previous = toUser(record);

  if (input.isActive === false && id === actorId) {
    throw AppError.conflict(
      'Vous ne pouvez pas désactiver votre propre compte.',
      'SELF_DEACTIVATION',
    );
  }

  if (input.email !== undefined && input.email !== previous.email) {
    const owner = await repository.findUserByEmail(input.email);
    if (owner && owner.id !== id) {
      throw AppError.conflict('Un compte utilise déjà cet email.', 'EMAIL_ALREADY_USED');
    }
  }

  const roleIds = input.roleCodes === undefined ? undefined : await resolveRoleIds(input.roleCodes);

  // Le contrôle du dernier SUPER_ADMIN ne porte que sur les opérations qui le
  // déclassent ou le désactivent : inutile d'interroger la base sinon.
  const nextRoles = input.roleCodes ?? previous.roles;
  const staysActive = input.isActive ?? previous.is_active;
  const wasActiveSuperAdmin = previous.roles.includes(SUPER_ADMIN_CODE) && previous.is_active;
  if (wasActiveSuperAdmin && (!nextRoles.includes(SUPER_ADMIN_CODE) || !staysActive)) {
    await assertNotLastActiveSuperAdmin();
  }

  const values: Record<string, unknown> = {};
  if (input.email !== undefined) values.email = input.email;
  if (input.firstName !== undefined) values.first_name = input.firstName;
  if (input.lastName !== undefined) values.last_name = input.lastName;
  if (input.phone !== undefined) values.phone = input.phone;
  if (input.isActive !== undefined) values.is_active = input.isActive;
  if (input.password !== undefined) values.password_hash = await hashPassword(input.password);

  if (Object.keys(values).length === 0 && roleIds === undefined) {
    throw AppError.badRequest('Aucun champ à mettre à jour.', 'NOTHING_TO_UPDATE');
  }

  if (roleIds === undefined) {
    await repository.updateUser(id, values);
  } else {
    await repository.updateUserWithRoles(id, values, roleIds);
  }

  // Un mot de passe changé par un administrateur ou un compte désactivé doit
  // couper les sessions en cours : les jetons encore valides sont révoqués.
  if (input.password !== undefined || input.isActive === false) {
    await revokeAllRefreshTokens(id);
  }

  return { user: toUser(await requireUser(id)), previous };
}

/**
 * Désactive un compte (suppression logique) et révoque ses sessions.
 * @returns l'état précédent, utilisé pour la piste d'audit.
 * @throws AppError 404 si absent, 409 en cas d'auto-désactivation ou si le
 *         compte est le dernier SUPER_ADMIN actif.
 */
export async function deactivateUser(id: number, actorId: number): Promise<User> {
  if (id === actorId) {
    throw AppError.conflict(
      'Vous ne pouvez pas désactiver votre propre compte.',
      'SELF_DEACTIVATION',
    );
  }

  const record = await requireUser(id);
  const previous = toUser(record);

  if (previous.roles.includes(SUPER_ADMIN_CODE) && previous.is_active) {
    await assertNotLastActiveSuperAdmin();
  }

  await repository.deactivateUser(id);
  await revokeAllRefreshTokens(id);

  return previous;
}

/**
 * Réinitialise le mot de passe d'un compte et révoque ses sessions.
 * Sans mot de passe fourni, la valeur de `SEED_DEFAULT_PASSWORD` est utilisée :
 * l'utilisateur devra le changer à sa prochaine connexion.
 * @throws AppError 404 si l'utilisateur n'existe pas.
 */
export async function resetPassword(id: number, password: string | undefined): Promise<void> {
  await requireUser(id);

  const passwordHash = await hashPassword(password ?? env.SEED_DEFAULT_PASSWORD);
  await updatePasswordHash(id, passwordHash);
  await revokeAllRefreshTokens(id);
}
