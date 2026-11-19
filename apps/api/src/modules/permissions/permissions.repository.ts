/**
 * Accès aux données des permissions.
 *
 * Les permissions sont un référentiel stable (77 lignes issues du seed) :
 * ce module est essentiellement en lecture, complété par les écritures de la
 * matrice `role_permissions` utilisées par le module des rôles.
 */

import type { Row } from '../../config/db.js';
import { execute, executeWith, query, queryOne, withTransaction } from '../../config/db.js';

/** Ligne de la table `permissions`. */
export interface PermissionRecord extends Row {
  id: number;
  code: string;
  resource: string;
  action: string;
  description: string | null;
}

const PERMISSION_COLUMNS = 'p.id, p.code, p.resource, p.action, p.description';

/** Toutes les permissions, triées par ressource puis par action. */
export async function findPermissions(): Promise<PermissionRecord[]> {
  return query<PermissionRecord>(
    `SELECT ${PERMISSION_COLUMNS}
     FROM permissions p
     ORDER BY p.resource ASC, FIELD(p.action, 'create', 'read', 'update', 'delete', 'manage'), p.code ASC`,
  );
}

/** Une permission par son identifiant. */
export async function findPermissionById(id: number): Promise<PermissionRecord | null> {
  return queryOne<PermissionRecord>(`SELECT ${PERMISSION_COLUMNS} FROM permissions p WHERE p.id = ?`, [id]);
}

/** Une permission par son code (`patient:create`). */
export async function findPermissionByCode(code: string): Promise<PermissionRecord | null> {
  return queryOne<PermissionRecord>(`SELECT ${PERMISSION_COLUMNS} FROM permissions p WHERE p.code = ?`, [code]);
}

/** Filtre une liste d'identifiants en ne gardant que ceux qui existent réellement. */
export async function findExistingPermissionIds(ids: readonly number[]): Promise<number[]> {
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await query<Row & { id: number }>(
    `SELECT id FROM permissions WHERE id IN (${placeholders})`,
    [...ids],
  );
  return rows.map((row) => row.id);
}

/** Matrice complète rôle → identifiants de permissions. */
export async function findRolePermissionMatrix(): Promise<Map<number, number[]>> {
  const rows = await query<Row & { role_id: number; permission_id: number }>(
    'SELECT role_id, permission_id FROM role_permissions ORDER BY role_id ASC, permission_id ASC',
  );

  const matrix = new Map<number, number[]>();
  for (const row of rows) {
    const current = matrix.get(row.role_id);
    if (current) current.push(row.permission_id);
    else matrix.set(row.role_id, [row.permission_id]);
  }
  return matrix;
}

/** Identifiants des permissions portées par un rôle. */
export async function findPermissionIdsByRoleId(roleId: number): Promise<number[]> {
  const rows = await query<Row & { permission_id: number }>(
    'SELECT permission_id FROM role_permissions WHERE role_id = ? ORDER BY permission_id ASC',
    [roleId],
  );
  return rows.map((row) => row.permission_id);
}

/**
 * Remplace intégralement les permissions d'un rôle.
 * L'opération est transactionnelle : la matrice n'est jamais partiellement écrite.
 */
export async function replaceRolePermissions(roleId: number, permissionIds: readonly number[]): Promise<void> {
  await withTransaction(async (connection) => {
    await executeWith(connection, 'DELETE FROM role_permissions WHERE role_id = ?', [roleId]);

    for (const permissionId of permissionIds) {
      await executeWith(connection, 'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [
        roleId,
        permissionId,
      ]);
    }
  });
}

/** Ajoute une permission à un rôle (sans écraser l'existant). */
export async function addRolePermission(roleId: number, permissionId: number): Promise<void> {
  await execute(
    'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
    [roleId, permissionId],
  );
}

/** Retire une permission d'un rôle. */
export async function removeRolePermission(roleId: number, permissionId: number): Promise<void> {
  await execute('DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?', [
    roleId,
    permissionId,
  ]);
}

/** Nombre total de permissions du référentiel. */
export async function countPermissions(): Promise<number> {
  const row = await queryOne<Row & { total: number }>('SELECT COUNT(*) AS total FROM permissions');
  return Number(row?.total ?? 0);
}
