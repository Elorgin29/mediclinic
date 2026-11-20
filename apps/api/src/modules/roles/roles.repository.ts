/**
 * Accès aux données du module des rôles.
 *
 * Toutes les requêtes sont préparées (`?`) et regroupées ici : les services ne
 * contiennent aucune chaîne SQL. Les écritures touchant à la fois `roles` et
 * `role_permissions` passent par des transactions.
 */

import type { PoolConnection } from 'mysql2/promise';

import type { Row } from '../../config/db.js';
import { execute, executeWith, query, queryOne, withTransaction } from '../../config/db.js';
import { buildSetClause } from '../../utils/http.js';
import type { PermissionRecord } from '../permissions/permissions.repository.js';

/** Ligne de la table `roles`. */
export interface RoleRecord extends Row {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_system: number;
  created_at: string;
}

/** Ligne de rôle enrichie des compteurs affichés dans la liste. */
export interface RoleWithCountsRecord extends RoleRecord {
  user_count: number;
  permission_count: number;
}

const ROLE_COLUMNS = 'r.id, r.code, r.name, r.description, r.is_system, r.created_at';

/** Colonnes modifiables de `roles` (liste blanche des UPDATE partiels). */
const ROLE_UPDATABLE_COLUMNS = ['name', 'description'] as const;

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Tous les rôles avec leur nombre d'utilisateurs et de permissions.
 * Les rôles système sont listés en premier : ils servent de référence.
 */
export async function findRoles(): Promise<RoleWithCountsRecord[]> {
  return query<RoleWithCountsRecord>(
    `SELECT ${ROLE_COLUMNS},
            COUNT(DISTINCT ur.user_id)       AS user_count,
            COUNT(DISTINCT rp.permission_id) AS permission_count
     FROM roles r
     LEFT JOIN user_roles ur       ON ur.role_id = r.id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     GROUP BY r.id, r.code, r.name, r.description, r.is_system, r.created_at
     ORDER BY r.is_system DESC, r.name ASC`,
  );
}

/** Récupère un rôle par son identifiant. */
export async function findRoleById(id: number): Promise<RoleRecord | null> {
  return queryOne<RoleRecord>(`SELECT ${ROLE_COLUMNS} FROM roles r WHERE r.id = ?`, [id]);
}

/** Récupère un rôle par son code (unicité avant création). */
export async function findRoleByCode(code: string): Promise<RoleRecord | null> {
  return queryOne<RoleRecord>(`SELECT ${ROLE_COLUMNS} FROM roles r WHERE r.code = ?`, [code]);
}

/** Récupère un rôle par son nom (unicité avant création ou renommage). */
export async function findRoleByName(name: string): Promise<RoleRecord | null> {
  return queryOne<RoleRecord>(`SELECT ${ROLE_COLUMNS} FROM roles r WHERE r.name = ?`, [name]);
}

/** Nombre d'utilisateurs portant le rôle (blocage de la suppression). */
export async function countUsersByRole(roleId: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM user_roles WHERE role_id = ?',
    [roleId],
  );
  return Number(row?.total ?? 0);
}

/**
 * Permissions portées par un rôle.
 * L'ordre suit celui de la matrice partagée (ressource puis action logique)
 * afin que l'écran d'administration reste stable.
 */
export async function findPermissionsByRoleId(roleId: number): Promise<PermissionRecord[]> {
  return query<PermissionRecord>(
    `SELECT p.id, p.code, p.resource, p.action, p.description
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ?
     ORDER BY p.resource ASC,
              FIELD(p.action, 'create', 'read', 'update', 'delete', 'manage') ASC`,
    [roleId],
  );
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreateRoleRecordInput {
  code: string;
  name: string;
  description: string | null;
}

/**
 * Insère les liens rôle ↔ permissions dans la transaction courante.
 * L'INSERT multi-lignes évite N allers-retours pour une matrice complète.
 */
async function insertRolePermissions(
  connection: PoolConnection,
  roleId: number,
  permissionIds: readonly number[],
): Promise<void> {
  if (permissionIds.length === 0) return;
  const placeholders = permissionIds.map(() => '(?, ?)').join(', ');
  const params = permissionIds.flatMap((permissionId) => [roleId, permissionId]);
  await executeWith(
    connection,
    `INSERT INTO role_permissions (role_id, permission_id) VALUES ${placeholders}`,
    params,
  );
}

/**
 * Crée un rôle personnalisé et sa matrice de permissions dans une transaction.
 * `is_system` reste à FALSE : seuls les rôles du référentiel sont système.
 */
export async function createRole(
  input: CreateRoleRecordInput,
  permissionIds: readonly number[],
): Promise<number> {
  return withTransaction(async (connection) => {
    const result = await executeWith(
      connection,
      `INSERT INTO roles (code, name, description, is_system)
       VALUES (?, ?, ?, FALSE)`,
      [input.code, input.name, input.description],
    );

    await insertRolePermissions(connection, result.insertId, permissionIds);
    return result.insertId;
  });
}

/** Met à jour les colonnes fournies d'un rôle (le code reste immuable). */
export async function updateRole(id: number, values: Record<string, unknown>): Promise<void> {
  const { sql, params } = buildSetClause(values, ROLE_UPDATABLE_COLUMNS);
  await execute(`UPDATE roles SET ${sql} WHERE id = ?`, [...params, id]);
}

/**
 * Met à jour un rôle et remplace intégralement sa matrice de permissions dans
 * une même transaction : la matrice ne doit jamais rester partielle.
 */
export async function updateRoleWithPermissions(
  id: number,
  values: Record<string, unknown>,
  permissionIds: readonly number[],
): Promise<void> {
  return withTransaction(async (connection) => {
    if (Object.keys(values).length > 0) {
      const { sql, params } = buildSetClause(values, ROLE_UPDATABLE_COLUMNS);
      await executeWith(connection, `UPDATE roles SET ${sql} WHERE id = ?`, [...params, id]);
    }

    await executeWith(connection, 'DELETE FROM role_permissions WHERE role_id = ?', [id]);
    await insertRolePermissions(connection, id, permissionIds);
  });
}

/** Remplace la matrice de permissions d'un rôle (DELETE puis INSERT). */
export async function replaceRolePermissions(
  roleId: number,
  permissionIds: readonly number[],
): Promise<void> {
  return withTransaction(async (connection) => {
    await executeWith(connection, 'DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    await insertRolePermissions(connection, roleId, permissionIds);
  });
}

/** Supprime un rôle (les liens `role_permissions` suivent en cascade). */
export async function deleteRole(id: number): Promise<void> {
  await execute('DELETE FROM roles WHERE id = ?', [id]);
}
