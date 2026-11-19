/**
 * Accès aux données du module d'authentification.
 *
 * Toutes les requêtes sont préparées (`?`) et regroupées ici : les services ne
 * contiennent aucune chaîne SQL.
 */

import type { Row } from '../../config/db.js';
import { execute, executeWith, queryOne, withTransaction } from '../../config/db.js';

/** Ligne complète d'un utilisateur, rôles et permissions agrégés. */
export interface UserRecord extends Row {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: number;
  last_login_at: Date | string | null;
  created_at: Date | string;
  patient_id: number | null;
  doctor_id: number | null;
  roles: string | null;
  permissions: string | null;
}

/** Ligne utilisateur augmentée du condensat de mot de passe (connexion). */
export interface CredentialsRecord extends UserRecord {
  password_hash: string;
}

/** Colonnes communes à toutes les lectures d'utilisateur. */
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

/** Récupère un utilisateur par son identifiant. */
export async function findUserById(id: number): Promise<UserRecord | null> {
  return queryOne<UserRecord>(
    `SELECT ${USER_COLUMNS} ${USER_JOINS}
     WHERE u.id = ?
     GROUP BY u.id, u.email, u.first_name, u.last_name, u.phone, u.is_active,
              u.last_login_at, u.created_at, pat.id, doc.id`,
    [id],
  );
}

/** Récupère un utilisateur par son email (insensible à la casse). */
export async function findUserByEmail(email: string): Promise<CredentialsRecord | null> {
  return queryOne<CredentialsRecord>(
    `SELECT ${USER_COLUMNS}, u.password_hash ${USER_JOINS}
     WHERE u.email = ?
     GROUP BY u.id, u.email, u.first_name, u.last_name, u.phone, u.is_active,
              u.last_login_at, u.created_at, u.password_hash, pat.id, doc.id`,
    [email.toLowerCase()],
  );
}

/** Renvoie le condensat bcrypt courant d'un utilisateur. */
export async function findPasswordHash(userId: number): Promise<string | null> {
  const row = await queryOne<Row & { password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = ?',
    [userId],
  );
  return row?.password_hash ?? null;
}

/** Met à jour le condensat de mot de passe. */
export async function updatePasswordHash(userId: number, passwordHash: string): Promise<void> {
  await execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

/** Enregistre la date de dernière connexion. */
export async function touchLastLogin(userId: number): Promise<void> {
  await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [userId]);
}

/** Renvoie l'identifiant d'un rôle à partir de son code. */
export async function findRoleIdByCode(code: string): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>('SELECT id FROM roles WHERE code = ?', [code]);
  return row?.id ?? null;
}

export interface CreatePatientAccountInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthDate: string;
  gender: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  insuranceNumber: string | null;
}

/**
 * Crée un compte patient complet : utilisateur, rattachement au rôle PATIENT
 * et dossier médical. L'ensemble est exécuté dans une transaction : si la
 * création du dossier échoue, le compte n'est pas créé.
 */
export async function createPatientAccount(
  input: CreatePatientAccountInput,
): Promise<{ userId: number; patientId: number }> {
  return withTransaction(async (connection) => {
    const userResult = await executeWith(
      connection,
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, is_active)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [input.email, input.passwordHash, input.firstName, input.lastName, input.phone],
    );
    const userId = userResult.insertId;

    const role = await queryOne<Row & { id: number }>(
      'SELECT id FROM roles WHERE code = ?',
      ['PATIENT'],
    );
    if (!role) {
      throw new Error('Le rôle PATIENT est absent de la base : exécutez 003_seed.sql.');
    }

    await executeWith(connection, 'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      userId,
      role.id,
    ]);

    const patientResult = await executeWith(
      connection,
      `INSERT INTO patients
         (user_id, first_name, last_name, birth_date, gender, address, city, postal_code,
          phone, email, insurance_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        input.firstName,
        input.lastName,
        input.birthDate,
        input.gender,
        input.address,
        input.city,
        input.postalCode,
        input.phone,
        input.email,
        input.insuranceNumber,
      ],
    );

    return { userId, patientId: patientResult.insertId };
  });
}

/* -------------------------------------------------------------------------- */
/* Jetons de rafraîchissement                                                  */
/* -------------------------------------------------------------------------- */

export interface RefreshTokenRecord extends Row {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
}

/** Enregistre un jeton de rafraîchissement (sous forme hachée). */
export async function insertRefreshToken(params: {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}): Promise<void> {
  await execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.userId,
      params.tokenHash,
      params.expiresAt,
      params.userAgent?.slice(0, 255) ?? null,
      params.ipAddress,
    ],
  );
}

/** Retrouve un jeton de rafraîchissement à partir de son empreinte. */
export async function findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
  return queryOne<RefreshTokenRecord>(
    `SELECT id, user_id, token_hash, expires_at, revoked_at
     FROM refresh_tokens WHERE token_hash = ?`,
    [tokenHash],
  );
}

/** Révoque un jeton précis (déconnexion ou rotation). */
export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL',
    [tokenHash],
  );
}

/** Révoque tous les jetons d'un utilisateur (changement de mot de passe). */
export async function revokeAllRefreshTokens(userId: number): Promise<void> {
  await execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [userId],
  );
}

/** Purge les jetons expirés ou révoqués depuis plus de 30 jours. */
export async function purgeExpiredRefreshTokens(): Promise<number> {
  const result = await execute(
    `DELETE FROM refresh_tokens
     WHERE expires_at < NOW()
        OR (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(NOW(), INTERVAL 30 DAY))`,
  );
  return result.affectedRows;
}
