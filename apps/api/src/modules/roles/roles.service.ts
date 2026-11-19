/**
 * Règles métier du module des rôles (RBAC).
 *
 * Points de vigilance :
 *  - le référentiel des rôles système (`is_system = TRUE`) est structurel : il
 *    peut être renommé ou redocumenté, mais jamais supprimé ;
 *  - un rôle encore porté par des utilisateurs ne doit pas disparaître, sous
 *    peine de priver ces comptes de tout ou partie de leurs droits ;
 *  - les identifiants de permissions reçus sont confrontés au référentiel
 *    avant toute écriture : une matrice ne doit jamais référencer un droit
 *    inexistant.
 * Aucune chaîne SQL dans ce fichier : tout passe par le repository.
 */

import type { CreateRoleInput, Permission, Role, UpdateRoleInput } from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import { findExistingPermissionIds } from '../permissions/permissions.repository.js';
import { toPermission } from '../permissions/permissions.service.js';
import * as repository from './roles.repository.js';
import type { RoleRecord, RoleWithCountsRecord } from './roles.repository.js';

/** Rôle exposé par l'API, enrichi des compteurs affichés dans la liste. */
export interface RoleWithCounts extends Role {
  user_count: number;
  permission_count: number;
}

/** Rôle complet : entête, compteurs et matrice de permissions détaillée. */
export interface RoleDetail extends RoleWithCounts {
  permissions: Permission[];
}

/** Résultat d'une modification : l'état avant et après, pour la piste d'audit. */
export interface RoleChange {
  previous: RoleDetail;
  role: RoleDetail;
}

/** Convertit une ligne SQL en objet `Role` (sans les permissions). */
function toRole(row: RoleRecord): Role {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    is_system: Boolean(row.is_system),
    created_at: String(row.created_at),
  };
}

/** Convertit une ligne enrichie en objet `Role` avec ses compteurs. */
function toRoleWithCounts(row: RoleWithCountsRecord): RoleWithCounts {
  return {
    ...toRole(row),
    user_count: Number(row.user_count ?? 0),
    permission_count: Number(row.permission_count ?? 0),
  };
}

/** Charge un rôle et échoue en 404 s'il n'existe pas. */
async function requireRole(id: number): Promise<RoleRecord> {
  const record = await repository.findRoleById(id);
  if (!record) throw AppError.notFound('Ce rôle est introuvable.', 'ROLE_NOT_FOUND');
  return record;
}

/**
 * Normalise une liste d'identifiants de permissions.
 * Les doublons sont écartés : la clé primaire de `role_permissions` les
 * refuserait et l'écriture de la matrice échouerait en pleine transaction.
 */
function uniqueIds(ids: readonly number[]): number[] {
  return [...new Set(ids)];
}

/**
 * Vérifie que tous les identifiants fournis existent dans le référentiel.
 * @throws AppError 422 en listant les identifiants inconnus.
 */
async function assertPermissionsExist(ids: readonly number[]): Promise<number[]> {
  const unique = uniqueIds(ids);
  if (unique.length === 0) return [];

  const existing = new Set(await findExistingPermissionIds(unique));
  const unknown = unique.filter((id) => !existing.has(id));

  if (unknown.length > 0) {
    throw AppError.unprocessable(
      `Permission(s) inconnue(s) : ${unknown.join(', ')}. Vérifiez le référentiel des permissions.`,
      'PERMISSION_NOT_FOUND',
      { unknownPermissionIds: unknown },
    );
  }

  return unique;
}

/** Charge la matrice de permissions d'un rôle sous forme d'objets `Permission`. */
async function loadPermissions(roleId: number): Promise<Permission[]> {
  const records = await repository.findPermissionsByRoleId(roleId);
  return records.map(toPermission);
}

/**
 * Assemble le détail complet d'un rôle (entête, compteurs, permissions).
 * `permission_count` est déduit de la matrice réellement chargée plutôt que
 * d'un second `COUNT` : les deux valeurs ne peuvent ainsi pas diverger.
 */
async function buildDetail(record: RoleRecord): Promise<RoleDetail> {
  const [permissions, userCount] = await Promise.all([
    loadPermissions(record.id),
    repository.countUsersByRole(record.id),
  ]);

  return {
    ...toRole(record),
    user_count: userCount,
    permission_count: permissions.length,
    permissions,
  };
}

/** Tous les rôles, avec leur nombre d'utilisateurs et de permissions. */
export async function listRoles(): Promise<RoleWithCounts[]> {
  const rows = await repository.findRoles();
  return rows.map(toRoleWithCounts);
}

/**
 * Détail d'un rôle : entête, compteurs et liste complète de ses permissions.
 * @throws AppError 404 si le rôle n'existe pas.
 */
export async function getRole(id: number): Promise<RoleDetail> {
  return buildDetail(await requireRole(id));
}

/** Permissions d'un rôle, dans un format dédié à l'écran de matrice. */
export async function getRolePermissions(
  id: number,
): Promise<{ roleId: number; permissions: Permission[] }> {
  const role = await requireRole(id);
  return { roleId: role.id, permissions: await loadPermissions(role.id) };
}

/**
 * Crée un rôle personnalisé et sa matrice de permissions.
 * @throws AppError 409 si le code ou le nom est déjà pris, 422 si une
 *         permission est inconnue.
 */
export async function createRole(input: CreateRoleInput): Promise<RoleDetail> {
  const [sameCode, sameName] = await Promise.all([
    repository.findRoleByCode(input.code),
    repository.findRoleByName(input.name),
  ]);

  if (sameCode) {
    throw AppError.conflict(
      `Le code de rôle « ${input.code} » est déjà utilisé.`,
      'ROLE_CODE_TAKEN',
      { code: input.code },
    );
  }
  if (sameName) {
    throw AppError.conflict(
      `Le nom de rôle « ${input.name} » est déjà utilisé.`,
      'ROLE_NAME_TAKEN',
      { name: input.name },
    );
  }

  const permissionIds = await assertPermissionsExist(input.permissionIds);

  const id = await repository.createRole(
    {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
    },
    permissionIds,
  );

  return getRole(id);
}

/**
 * Met à jour un rôle.
 *
 * Le code reste immuable (il est référencé par le front et par les gardes
 * RBAC). Les rôles système acceptent une modification de `name`/`description`
 * et de leur matrice : seule leur **suppression** est interdite.
 *
 * @throws AppError 404 si absent, 409 si le nom appartient à un autre rôle,
 *         422 si une permission est inconnue.
 */
export async function updateRole(id: number, input: UpdateRoleInput): Promise<RoleChange> {
  const record = await requireRole(id);
  const previous = await buildDetail(record);

  if (input.name !== undefined && input.name !== previous.name) {
    const owner = await repository.findRoleByName(input.name);
    if (owner && owner.id !== id) {
      throw AppError.conflict(
        `Le nom de rôle « ${input.name} » est déjà utilisé.`,
        'ROLE_NAME_TAKEN',
        { name: input.name },
      );
    }
  }

  const permissionIds =
    input.permissionIds === undefined
      ? undefined
      : await assertPermissionsExist(input.permissionIds);

  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.description !== undefined) values.description = input.description;

  if (Object.keys(values).length === 0 && permissionIds === undefined) {
    throw AppError.badRequest('Aucun champ à mettre à jour.', 'NOTHING_TO_UPDATE');
  }

  if (permissionIds === undefined) {
    await repository.updateRole(id, values);
  } else {
    await repository.updateRoleWithPermissions(id, values, permissionIds);
  }

  return { previous, role: await getRole(id) };
}

/**
 * Supprime un rôle personnalisé inutilisé.
 * @returns le rôle supprimé (avec ses permissions), pour la piste d'audit.
 * @throws AppError 404 si absent, 409 si le rôle est système ou encore porté
 *         par des utilisateurs.
 */
export async function removeRole(id: number): Promise<RoleDetail> {
  const role = await getRole(id);

  if (role.is_system) {
    throw AppError.conflict(
      `Le rôle système « ${role.name} » ne peut pas être supprimé.`,
      'ROLE_IS_SYSTEM',
      { roleId: role.id, code: role.code },
    );
  }

  const usersCount = await repository.countUsersByRole(id);
  if (usersCount > 0) {
    throw AppError.conflict(
      `Impossible de supprimer le rôle « ${role.name} » : ${usersCount} utilisateur(s) le portent encore.`,
      'ROLE_IN_USE',
      { user_count: usersCount },
    );
  }

  await repository.deleteRole(id);
  return role;
}

/**
 * Remplace intégralement la matrice de permissions d'un rôle.
 * @throws AppError 404 si le rôle est absent, 422 si une permission est inconnue.
 */
export async function replacePermissions(
  id: number,
  permissionIds: readonly number[],
): Promise<RoleChange> {
  const record = await requireRole(id);
  const previous = await buildDetail(record);

  const validIds = await assertPermissionsExist(permissionIds);
  await repository.replaceRolePermissions(id, validIds);

  return { previous, role: await getRole(id) };
}
