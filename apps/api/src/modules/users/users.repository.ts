/**
 * Accès aux données du module de gestion des utilisateurs.
 *
 * Toutes les requêtes sont préparées (`?`) et regroupées ici : les services ne
 * contiennent aucune chaîne SQL. Le chargement d'un utilisateur complet (rôles
 * et permissions agrégés) est factorisé dans `USER_WITH_RELATIONS_SQL` afin
 * d'être partagé par la fiche, la liste et les contrôles d'intégrité.
 */

import type { PoolConnection } from 'mysql2/promise';

import type { Row } from '../../config/db.js';
import { execute, executeWith, query, queryOne, withTransaction } from '../../config/db.js';
import { buildSetClause } from '../../utils/http.js';
import { buildOrderBy, likePattern, whereClause } from '../../utils/pagination.js';

/** Ligne d'un utilisateur, rôles et permissions agrégés. */
export interface UserRecord extends Row {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  patient_id: number | null;
  doctor_id: number | null;
  roles: string | null;
  permissions: string | null;
}

/** Couple (identifiant, code) d'un rôle, utilisé pour valider les entrées. */
export interface RoleRefRecord extends Row {
  id: number;
  code: string;
}

/* -------------------------------------------------------------------------- */
/* Requête unique de chargement d'un utilisateur                               */
/* -------------------------------------------------------------------------- */

/**
 * Colonnes d'un utilisateur, rôles et permissions agrégés.
 * `GROUP_CONCAT(DISTINCT ...)` évite l'explosion du produit cartésien entre
 * les rôles et leurs permissions (même approche que `auth.middleware.ts`).
 */
const USER_COLUMNS = `
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.phone,
  u.is_active,
  u.last_login_at,
  u.created_at,
  pat.id AS patient_id,
  doc.id AS doctor_id,
  GROUP_CONCAT(DISTINCT r.code ORDER BY r.code SEPARATOR ',')       AS roles,
  GROUP_CONCAT(DISTINCT perm.code ORDER BY perm.code SEPARATOR ',') AS permissions
`;

const USER_JOINS = `
  FROM users u
  LEFT JOIN user_roles ur       ON ur.user_id = u.id
  LEFT JOIN roles r             ON r.id = ur.role_id
  LEFT JOIN role_permissions rp ON rp.role_id = r.id
  LEFT JOIN permissions perm    ON perm.id = rp.permission_id
  LEFT JOIN patients pat        ON pat.user_id = u.id
  LEFT JOIN doctors doc         ON doc.user_id = u.id
`;

const USER_GROUP_BY = `
  u.id, u.email, u.first_name, u.last_name, u.phone, u.is_active,
  u.last_login_at, u.created_at, pat.id, doc.id
`;

/**
 * Requête unique et réutilisable de chargement d'un utilisateur complet à
 * partir de son identifiant. Elle sert à la fiche, à la réponse d'une écriture
 * et aux contrôles métier : une seule définition garantit une vue cohérente.
 */
export const USER_WITH_RELATIONS_SQL = `
  SELECT ${USER_COLUMNS}
  ${USER_JOINS}
  WHERE u.id = ?
  GROUP BY ${USER_GROUP_BY}
`;

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Récupère un utilisateur complet par son identifiant. */
export async function findUserById(id: number): Promise<UserRecord | null> {
  return queryOne<UserRecord>(USER_WITH_RELATIONS_SQL, [id]);
}

/** Récupère un utilisateur complet par son email (insensible à la casse). */
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return queryOne<UserRecord>(
    `SELECT ${USER_COLUMNS}
     ${USER_JOINS}
     WHERE u.email = ?
     GROUP BY ${USER_GROUP_BY}`,
    [email.toLowerCase()],
  );
}

/** Critères de filtrage de la liste des utilisateurs. */
export interface UserFilters {
  /** Recherche partielle sur l'email, le prénom ou le nom. */
  search?: string;
  /** Code de rôle exact (rôles personnalisés compris). */
  role?: string;
  /** État d'activation du compte. */
  isActive?: boolean;
}

/** Options complètes d'une page de liste (filtres, tri et bornes). */
export interface ListUsersOptions extends UserFilters {
  sort?: string;
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

/**
 * Expressions de tri autorisées (liste blanche) : la valeur reçue du client est
 * une clé, jamais un fragment SQL.
 */
const USER_SORT_EXPRESSIONS: Readonly<Record<string, string>> = {
  id: 'u.id',
  email: 'u.email',
  first_name: 'u.first_name',
  firstName: 'u.first_name',
  last_name: 'u.last_name',
  lastName: 'u.last_name',
  is_active: 'u.is_active',
  isActive: 'u.is_active',
  last_login_at: 'u.last_login_at',
  lastLoginAt: 'u.last_login_at',
  created_at: 'u.created_at',
  createdAt: 'u.created_at',
};

/**
 * Liste paginée des utilisateurs avec leurs rôles et permissions.
 * Le total est calculé par une requête dédiée : regrouper puis compter dans la
 * même requête obligerait à charger toutes les lignes.
 */
export async function findUsers(
  options: ListUsersOptions,
): Promise<{ rows: UserRecord[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.search) {
    const pattern = likePattern(options.search);
    conditions.push('(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)');
    params.push(pattern, pattern, pattern);
  }

  if (options.role) {
    // Sous-requête plutôt qu'une jointure supplémentaire : un utilisateur ne
    // doit apparaître qu'une fois, même filtré sur un de ses rôles.
    conditions.push(
      `EXISTS (
         SELECT 1
         FROM user_roles ur_filter
         JOIN roles r_filter ON r_filter.id = ur_filter.role_id
         WHERE ur_filter.user_id = u.id AND r_filter.code = ?
       )`,
    );
    params.push(options.role);
  }

  if (options.isActive !== undefined) {
    conditions.push('u.is_active = ?');
    params.push(options.isActive ? 1 : 0);
  }

  const where = whereClause(conditions);
  const orderBy = buildOrderBy(options.sort, options.order, USER_SORT_EXPRESSIONS, 'u.created_at');

  const rows = await query<UserRecord>(
    `SELECT ${USER_COLUMNS}
     ${USER_JOINS}
     ${where}
     GROUP BY ${USER_GROUP_BY}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, options.limit, options.offset],
  );

  const totalRow = await queryOne<Row & { total: number }>(
    `SELECT COUNT(DISTINCT u.id) AS total FROM users u ${where}`,
    params,
  );

  return { rows, total: Number(totalRow?.total ?? 0) };
}

/** Rôles correspondant aux codes fournis (validation avant création des liens). */
export async function findRolesByCodes(codes: readonly string[]): Promise<RoleRefRecord[]> {
  if (codes.length === 0) return [];
  const placeholders = codes.map(() => '?').join(', ');
  return query<RoleRefRecord>(
    `SELECT id, code FROM roles WHERE code IN (${placeholders})`,
    [...codes],
  );
}

/** Nombre d'utilisateurs actifs portant le rôle donné. */
export async function countActiveUsersWithRole(code: string): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(DISTINCT u.id) AS total
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r       ON r.id = ur.role_id
     WHERE u.is_active = TRUE AND r.code = ?`,
    [code],
  );
  return Number(row?.total ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/** Colonnes modifiables de `users` (liste blanche des UPDATE partiels). */
const USER_UPDATABLE_COLUMNS = [
  'email',
  'first_name',
  'last_name',
  'phone',
  'is_active',
  'password_hash',
] as const;

export interface CreateUserRecordInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
}

/**
 * Insère les liens utilisateur ↔ rôles dans la transaction courante.
 * L'INSERT multi-lignes évite N allers-retours pour un même compte.
 */
async function insertUserRoles(
  connection: PoolConnection,
  userId: number,
  roleIds: readonly number[],
): Promise<void> {
  if (roleIds.length === 0) return;
  const placeholders = roleIds.map(() => '(?, ?)').join(', ');
  const params = roleIds.flatMap((roleId) => [userId, roleId]);
  await executeWith(
    connection,
    `INSERT INTO user_roles (user_id, role_id) VALUES ${placeholders}`,
    params,
  );
}

/**
 * Crée un compte et ses rôles dans une transaction : sans elle, un échec sur
 * l'attribution des rôles laisserait un utilisateur sans aucun droit.
 */
export async function createUser(
  input: CreateUserRecordInput,
  roleIds: readonly number[],
): Promise<number> {
  return withTransaction(async (connection) => {
    const result = await executeWith(
      connection,
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.email,
        input.passwordHash,
        input.firstName,
        input.lastName,
        input.phone,
        input.isActive,
      ],
    );

    await insertUserRoles(connection, result.insertId, roleIds);
    return result.insertId;
  });
}

/** Met à jour les colonnes fournies d'un utilisateur. */
export async function updateUser(id: number, values: Record<string, unknown>): Promise<void> {
  const { sql, params } = buildSetClause(values, USER_UPDATABLE_COLUMNS);
  await execute(`UPDATE users SET ${sql} WHERE id = ?`, [...params, id]);
}

/**
 * Met à jour un utilisateur et remplace intégralement ses rôles dans une même
 * transaction : un compte ne doit jamais se retrouver sans rôle à cause d'un
 * échec survenu après la suppression des anciens liens.
 */
export async function updateUserWithRoles(
  id: number,
  values: Record<string, unknown>,
  roleIds: readonly number[],
): Promise<void> {
  return withTransaction(async (connection) => {
    if (Object.keys(values).length > 0) {
      const { sql, params } = buildSetClause(values, USER_UPDATABLE_COLUMNS);
      await executeWith(connection, `UPDATE users SET ${sql} WHERE id = ?`, [...params, id]);
    }

    await executeWith(connection, 'DELETE FROM user_roles WHERE user_id = ?', [id]);
    await insertUserRoles(connection, id, roleIds);
  });
}

/** Désactive un compte (suppression logique : l'historique reste intact). */
export async function deactivateUser(id: number): Promise<void> {
  await execute('UPDATE users SET is_active = FALSE WHERE id = ?', [id]);
}
