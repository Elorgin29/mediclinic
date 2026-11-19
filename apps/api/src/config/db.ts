/**
 * Accès à la base MySQL.
 *
 * Aucun ORM : toutes les requêtes sont écrites à la main et passées au pool
 * `mysql2/promise`. Les paramètres sont TOUJOURS transmis via des marqueurs
 * `?` (requêtes préparées), jamais par concaténation de chaînes : c'est la
 * protection contre les injections SQL.
 */

import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { env } from './env.js';

export const pool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  maxIdle: env.DB_CONNECTION_LIMIT,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'local',
  // Les colonnes DATE / DATETIME / TIMESTAMP sont renvoyées telles quelles
  // (« 2026-11-18 », « 2026-11-18 09:00:00 ») : aucune conversion de fuseau ne
  // vient décaler une date de naissance ou une échéance. Les valeurs entrantes
  // sont normalisées par utils/datetime.ts.
  dateStrings: true,
  // Les colonnes DECIMAL (prix, montants) sont volontairement renvoyées en
  // chaîne, comme les déclarent les types de @mediclinic/shared (`price: string`).
  // Elles sont converties en nombre uniquement dans les agrégats de statistiques.
  supportBigNumbers: true,
  bigNumberStrings: false,
  ...(env.DB_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

/** Ligne générique renvoyée par une requête SELECT. */
export type Row = RowDataPacket;

/**
 * Type des valeurs acceptées par `pool.execute`.
 * On le dérive de la signature du pool pour rester aligné sur mysql2 sans
 * écrire `any` explicitement.
 */
type MysqlExecuteParams = Parameters<Pool['execute']>[1];

/**
 * Exécute une requête de lecture et renvoie les lignes.
 * @param sql    requête SQL avec des marqueurs `?`
 * @param params valeurs à substituer
 */
export async function query<T extends Row = Row>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const [rows] = await pool.query<T[]>(sql, params as unknown[]);
  return rows;
}

/** Exécute une requête de lecture et renvoie la première ligne (ou `null`). */
export async function queryOne<T extends Row = Row>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Exécute une requête d'écriture et renvoie le résultat (affectedRows, insertId…). */
export async function execute(
  sql: string,
  params: readonly unknown[] = [],
): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(
    sql,
    params as unknown as MysqlExecuteParams,
  );
  return result;
}

/** Exécute une requête d'écriture et renvoie l'identifiant inséré. */
export async function insert(sql: string, params: readonly unknown[] = []): Promise<number> {
  const result = await execute(sql, params);
  return result.insertId;
}

/** Variante de `query` s'appuyant sur une connexion de transaction. */
export async function queryWith<T extends Row = Row>(
  connection: PoolConnection,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const [rows] = await connection.query<T[]>(sql, params as unknown[]);
  return rows;
}

/** Variante de `execute` s'appuyant sur une connexion de transaction. */
export async function executeWith(
  connection: PoolConnection,
  sql: string,
  params: readonly unknown[] = [],
): Promise<ResultSetHeader> {
  const [result] = await connection.execute<ResultSetHeader>(
    sql,
    params as unknown as MysqlExecuteParams,
  );
  return result;
}

/**
 * Exécute une fonction dans une transaction.
 * La transaction est validée si la fonction se termine normalement, annulée
 * sinon (l'erreur est propagée à l'appelant).
 *
 * @example
 * const invoiceId = await withTransaction(async (conn) => {
 *   const res = await executeWith(conn, 'INSERT INTO invoices (…) VALUES (…)', values);
 *   await executeWith(conn, 'INSERT INTO invoice_items (…) VALUES (…)', lines);
 *   return res.insertId;
 * });
 */
export async function withTransaction<T>(
  handler: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // L'annulation a échoué (connexion perdue) : on remonte l'erreur initiale.
    }
    throw error;
  } finally {
    connection.release();
  }
}

/** Vérifie que la base répond. Utilisé au démarrage et par /api/health. */
export async function testConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const row = await queryOne<Row & { version: string }>('SELECT VERSION() AS version');
    return { ok: true, version: row?.version ?? 'inconnue' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Ferme proprement le pool (arrêt du serveur, fin des tests). */
export async function closePool(): Promise<void> {
  await pool.end();
}

/**
 * Construit une clause `LIMIT ? OFFSET ?` et les paramètres associés.
 * Le tri est validé par une liste blanche (voir utils/pagination.ts).
 */
export function limitClause(limit: number, offset: number): { sql: string; params: number[] } {
  return { sql: 'LIMIT ? OFFSET ?', params: [limit, offset] };
}
