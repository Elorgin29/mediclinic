/**
 * Règles métier des notifications internes.
 *
 * Deux principes :
 *  1. **Cloisonnement** : toute opération est filtrée par `user_id`. Une
 *     notification appartenant à un autre compte est traitée comme un accès
 *     interdit (403), et non comme une simple absence (404), afin que le
 *     front distingue clairement les deux cas.
 *  2. **Envoi administrateur** : `POST /` diffuse un même message à une liste
 *     de destinataires ou à l'ensemble des comptes actifs, en une seule
 *     requête d'insertion.
 */

import type { NotificationType } from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import type { Pagination } from '../../utils/pagination.js';
import * as repository from './notifications.repository.js';
import type { NotificationRow } from './notifications.repository.js';

/* -------------------------------------------------------------------------- */
/* Objets exposés par l'API                                                    */
/* -------------------------------------------------------------------------- */

/** Notification telle qu'exposée par l'API (`is_read` converti en booléen). */
export interface NotificationView {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

/** Charge utile de l'envoi administrateur. */
export interface BroadcastInput {
  userIds: number[] | 'all';
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
}

/* -------------------------------------------------------------------------- */
/* Conversions                                                                 */
/* -------------------------------------------------------------------------- */

/** Convertit une ligne de `notifications` : `TINYINT(1)` → booléen. */
export function toNotification(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type,
    is_read: Boolean(row.is_read),
    link: row.link,
    created_at: String(row.created_at),
  };
}

/* -------------------------------------------------------------------------- */
/* Filtres                                                                     */
/* -------------------------------------------------------------------------- */

/** Filtres normalisés de la liste (issus de la query string validée). */
export interface NotificationQuery {
  isRead?: boolean;
  type?: NotificationType;
  /** Conservé pour compatibilité avec `notificationQuerySchema` partagé. */
  unreadOnly?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Liste et compteur                                                           */
/* -------------------------------------------------------------------------- */

/** Notifications de l'utilisateur connecté, de la plus récente à la plus ancienne. */
export async function listNotifications(
  userId: number,
  filters: NotificationQuery,
  pagination: Pagination,
): Promise<{ data: NotificationView[]; total: number }> {
  const applied = {
    userId,
    isRead: filters.isRead,
    type: filters.type,
    unreadOnly: filters.unreadOnly,
  };

  const [rows, total] = await Promise.all([
    repository.findNotifications({
      ...applied,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    repository.countNotifications(applied),
  ]);

  return { data: rows.map(toNotification), total };
}

/** Nombre de notifications non lues (badge de l'en-tête). */
export async function getUnreadCount(userId: number): Promise<number> {
  return repository.countUnread(userId);
}

/* -------------------------------------------------------------------------- */
/* Marquer comme lu                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Marque une notification comme lue.
 *
 * Le chargement préalable permet de distinguer « inexistante » (404) de
 * « appartenant à un autre compte » (403).
 *
 * @throws 404 `NOTIFICATION_NOT_FOUND`
 * @throws 403 `NOTIFICATION_FORBIDDEN`
 */
export async function markAsRead(userId: number, id: number): Promise<NotificationView> {
  const row = await repository.findNotificationById(id);
  if (!row) {
    throw AppError.notFound('Notification introuvable.', 'NOTIFICATION_NOT_FOUND');
  }
  if (row.user_id !== userId) {
    throw AppError.forbidden(
      'Cette notification appartient à un autre utilisateur.',
      'NOTIFICATION_FORBIDDEN',
    );
  }

  await repository.markAsRead(id, userId);

  // Relecture : `is_read` vient d'être modifié côté base.
  const updated = await repository.findNotificationById(id);
  if (!updated) {
    throw AppError.internal('La notification mise à jour est introuvable.');
  }
  return toNotification(updated);
}

/**
 * Marque comme lues toutes les notifications de l'utilisateur, ou seulement
 * celles dont les identifiants sont fournis.
 *
 * @returns le nombre de notifications effectivement modifiées.
 */
export async function markAllAsRead(
  userId: number,
  ids?: readonly number[],
): Promise<number> {
  return repository.markManyAsRead(userId, ids);
}

/* -------------------------------------------------------------------------- */
/* Suppression                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Supprime une notification personnelle.
 *
 * @throws 404 `NOTIFICATION_NOT_FOUND`
 * @throws 403 `NOTIFICATION_FORBIDDEN`
 */
export async function deleteNotification(userId: number, id: number): Promise<void> {
  const row = await repository.findNotificationById(id);
  if (!row) {
    throw AppError.notFound('Notification introuvable.', 'NOTIFICATION_NOT_FOUND');
  }
  if (row.user_id !== userId) {
    throw AppError.forbidden(
      'Cette notification appartient à un autre utilisateur.',
      'NOTIFICATION_FORBIDDEN',
    );
  }

  await repository.deleteNotification(id, userId);
}

/* -------------------------------------------------------------------------- */
/* Envoi administrateur                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Envoie une notification interne au nom de l'administration.
 *
 * `userIds: 'all'` cible tous les comptes actifs. Les identifiants inconnus ou
 * désactivés sont ignorés : l'appel reste idempotent, et le nombre renvoyé est
 * celui des destinataires réellement servis.
 *
 * @throws 422 `NO_RECIPIENT` si aucun destinataire valide n'est trouvé.
 */
export async function broadcastNotification(input: BroadcastInput): Promise<number> {
  const recipients =
    input.userIds === 'all'
      ? await repository.findActiveUserIds()
      : await repository.findExistingUserIds(input.userIds);

  if (recipients.length === 0) {
    throw AppError.unprocessable(
      'Aucun destinataire valide n’a été trouvé pour cette notification.',
      'NO_RECIPIENT',
    );
  }

  return repository.insertNotifications(recipients, {
    title: input.title,
    message: input.message,
    type: input.type,
    link: input.link ?? null,
  });
}
