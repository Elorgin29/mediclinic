/**
 * Accès aux données des notifications internes.
 *
 * Les notifications sont strictement personnelles : toutes les lectures sont
 * filtrées par `user_id`, et aucune requête de ce fichier ne permet de lister
 * les notifications d'un autre compte. L'envoi groupé par un administrateur
 * constitue la seule écriture multi-destinataires.
 *
 * Toutes les requêtes sont préparées (`?`).
 */

import type { NotificationType } from '@mediclinic/shared';

import type { Row } from '../../config/db.js';
import { execute, insert, query, queryOne } from '../../config/db.js';
import { whereClause } from '../../utils/pagination.js';

/* -------------------------------------------------------------------------- */
/* Lignes SQL                                                                  */
/* -------------------------------------------------------------------------- */

/** Ligne de la table `notifications`. */
export interface NotificationRow extends Row {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: NotificationType;
  is_read: number;
  link: string | null;
  created_at: string;
}

/** Colonnes exposées par l'API. */
const NOTIFICATION_COLUMNS = `
  n.id,
  n.user_id,
  n.title,
  n.message,
  n.type,
  n.is_read,
  n.link,
  n.created_at
`;

/* -------------------------------------------------------------------------- */
/* Filtres                                                                     */
/* -------------------------------------------------------------------------- */

/** Filtres de liste, toujours combinés au destinataire. */
export interface NotificationFilters {
  userId: number;
  /** `true` = lues, `false` = non lues, `undefined` = les deux. */
  isRead?: boolean;
  type?: NotificationType;
  /** Compatibilité avec le schéma partagé : équivaut à `isRead: false`. */
  unreadOnly?: boolean;
}

/** Filtres + pagination. */
export interface NotificationListOptions extends NotificationFilters {
  limit: number;
  offset: number;
}

/** Construit la clause `WHERE` commune à la liste et au comptage. */
function buildNotificationWhere(filters: NotificationFilters): {
  where: string;
  params: unknown[];
} {
  const clauses: string[] = ['n.user_id = ?'];
  const params: unknown[] = [filters.userId];

  if (filters.isRead !== undefined) {
    clauses.push('n.is_read = ?');
    params.push(filters.isRead ? 1 : 0);
  } else if (filters.unreadOnly === true) {
    clauses.push('n.is_read = 0');
  }

  if (filters.type !== undefined) {
    clauses.push('n.type = ?');
    params.push(filters.type);
  }

  return { where: whereClause(clauses), params };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Liste paginée des notifications d'un utilisateur, de la plus récente à la plus ancienne. */
export async function findNotifications(
  options: NotificationListOptions,
): Promise<NotificationRow[]> {
  const { where, params } = buildNotificationWhere(options);

  return query<NotificationRow>(
    `SELECT ${NOTIFICATION_COLUMNS}
     FROM notifications n
     ${where}
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT ? OFFSET ?`,
    [...params, options.limit, options.offset],
  );
}

/** Nombre de notifications correspondant aux filtres. */
export async function countNotifications(filters: NotificationFilters): Promise<number> {
  const { where, params } = buildNotificationWhere(filters);
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total FROM notifications n ${where}`,
    params,
  );
  return Number(row?.total ?? 0);
}

/** Une notification précise (le destinataire est renvoyé pour le contrôle d'accès). */
export async function findNotificationById(id: number): Promise<NotificationRow | null> {
  return queryOne<NotificationRow>(
    `SELECT ${NOTIFICATION_COLUMNS}
     FROM notifications n
     WHERE n.id = ?`,
    [id],
  );
}

/** Nombre de notifications non lues d'un utilisateur (badge du menu). */
export async function countUnread(userId: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId],
  );
  return Number(row?.total ?? 0);
}

/** Identifiants des utilisateurs actifs (envoi groupé « tous les utilisateurs »). */
export async function findActiveUserIds(): Promise<number[]> {
  const rows = await query<Row & { id: number }>(
    'SELECT id FROM users WHERE is_active = TRUE ORDER BY id ASC',
  );
  return rows.map((row) => row.id);
}

/** Compte les destinataires valides parmi les identifiants fournis. */
export async function findExistingUserIds(
  userIds: readonly number[],
): Promise<number[]> {
  if (userIds.length === 0) return [];

  const placeholders = userIds.map(() => '?').join(', ');
  const rows = await query<Row & { id: number }>(
    `SELECT id FROM users WHERE is_active = TRUE AND id IN (${placeholders}) ORDER BY id ASC`,
    [...userIds],
  );
  return rows.map((row) => row.id);
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/** Valeurs d'une notification à insérer. */
export interface NewNotificationValues {
  userId: number;
  title: string;
  message: string;
  type: NotificationType;
  link: string | null;
}

/** Insère une notification et renvoie son identifiant. */
export async function insertNotification(values: NewNotificationValues): Promise<number> {
  return insert(
    `INSERT INTO notifications (user_id, title, message, type, link)
     VALUES (?, ?, ?, ?, ?)`,
    [values.userId, values.title, values.message, values.type, values.link],
  );
}

/**
 * Insère une notification par destinataire en une seule requête.
 * Les marqueurs `?` sont générés à partir du nombre de destinataires : la
 * structure ne dépend jamais du contenu.
 */
export async function insertNotifications(
  recipients: readonly number[],
  payload: Omit<NewNotificationValues, 'userId'>,
): Promise<number> {
  if (recipients.length === 0) return 0;

  const placeholders = recipients.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const params = recipients.flatMap((userId) => [
    userId,
    payload.title,
    payload.message,
    payload.type,
    payload.link,
  ]);

  const result = await execute(
    `INSERT INTO notifications (user_id, title, message, type, link)
     VALUES ${placeholders}`,
    params,
  );
  return result.affectedRows;
}

/** Marque une notification comme lue ; renvoie le nombre de lignes modifiées. */
export async function markAsRead(id: number, userId: number): Promise<number> {
  const result = await execute(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [id, userId],
  );
  return result.affectedRows;
}

/**
 * Marque toutes les notifications non lues d'un utilisateur, ou seulement
 * celles dont les identifiants sont fournis. Le filtre `user_id` est toujours
 * présent : impossible de marquer les notifications d'un autre compte.
 */
export async function markManyAsRead(
  userId: number,
  ids?: readonly number[],
): Promise<number> {
  if (ids !== undefined && ids.length === 0) return 0;

  const idsClause =
    ids === undefined ? '' : `AND id IN (${ids.map(() => '?').join(', ')})`;
  const params: unknown[] = ids === undefined ? [userId] : [userId, ...ids];

  const result = await execute(
    `UPDATE notifications SET is_read = 1
     WHERE user_id = ? AND is_read = 0 ${idsClause}`,
    params,
  );
  return result.affectedRows;
}

/** Supprime une notification appartenant à l'utilisateur. */
export async function deleteNotification(id: number, userId: number): Promise<number> {
  const result = await execute(
    'DELETE FROM notifications WHERE id = ? AND user_id = ?',
    [id, userId],
  );
  return result.affectedRows;
}
