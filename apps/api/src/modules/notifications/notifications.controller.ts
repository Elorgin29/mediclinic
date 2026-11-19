/**
 * Contrôleurs HTTP des notifications internes.
 *
 * Aucune règle métier ici : validation de l'entrée, appel au service, mise en
 * forme de la réponse. Le destinataire est TOUJOURS `req.user.id` : il ne
 * provient jamais du corps ou de la query string.
 */

import {
  NOTIFICATION_TYPES,
  idSchema,
  markReadSchema,
  notificationQuerySchema,
} from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/http.js';
import { paginated, parsePagination } from '../../utils/pagination.js';
import * as service from './notifications.service.js';

/**
 * Booléen de query string strict (`true`/`1`/`false`/`0`).
 * `z.coerce.boolean()` convertirait la chaîne « false » en `true`.
 */
const queryBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

/** Filtres de liste : pagination partagée + `isRead` et `type`. */
const notificationListQuerySchema = notificationQuerySchema.extend({
  isRead: queryBooleanSchema.optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});

/**
 * Corps de l'envoi administrateur : validé localement car ce schéma n'existe
 * pas dans `@mediclinic/shared` (l'envoi interne est une fonction back-office).
 */
const broadcastSchema = z.object({
  userIds: z.union([z.array(idSchema), z.literal('all')]),
  title: z.string().min(1, 'Le titre est obligatoire').max(150),
  message: z.string().min(1, 'Le message est obligatoire').max(1000),
  type: z.enum(NOTIFICATION_TYPES).default('INFO'),
  link: z.string().max(255).optional(),
});

/** Récupère l'utilisateur authentifié (garanti par le middleware `authenticate`). */
function requireUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  return req.user;
}

/** Lit et valide un paramètre de route entier. */
function readId(req: Request, name = 'id'): number {
  return idSchema.parse(req.params[name]);
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/notifications
 * Notifications de l'utilisateur connecté, paginées, de la plus récente à la
 * plus ancienne.
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const query = notificationListQuerySchema.parse(req.query);
  const pagination = parsePagination(query);

  const { data, total } = await service.listNotifications(
    user.id,
    {
      isRead: query.isRead,
      type: query.type,
      unreadOnly: query.unreadOnly,
    },
    pagination,
  );

  res.json(paginated(data, total, pagination));
});

/**
 * GET /api/notifications/unread-count
 * Compteur du badge. Déclaré avant `/:id`.
 */
export const unreadCount: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const count = await service.getUnreadCount(user.id);
  res.json({ data: { count } });
});

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/notifications
 * Envoi interne par un administrateur : une ligne par destinataire.
 */
export const broadcast: RequestHandler = asyncHandler(async (req, res) => {
  const input = broadcastSchema.parse(req.body);
  const created = await service.broadcastNotification(input);

  setAuditPayload(res, {
    resourceId: null,
    newValue: {
      recipients: input.userIds === 'all' ? 'all' : input.userIds,
      title: input.title,
      type: input.type,
      created,
    },
  });

  res.status(201).json({ data: { created } });
});

/**
 * POST /api/notifications/read-all
 * Marque toutes les notifications de l'utilisateur comme lues, ou seulement
 * celles listées dans `ids`.
 */
export const readAll: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const body = markReadSchema.parse(req.body ?? {});
  const updated = await service.markAllAsRead(user.id, body.ids);

  res.json({ data: { updated } });
});

/**
 * PATCH /api/notifications/:id/read
 * Marque une notification comme lue ; 403 si elle appartient à un autre compte.
 */
export const markRead: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = readId(req);
  const notification = await service.markAsRead(user.id, id);

  setAuditPayload(res, {
    resourceId: id,
    newValue: { is_read: notification.is_read },
  });

  res.json({ data: notification });
});

/**
 * DELETE /api/notifications/:id
 * Supprime une notification personnelle.
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = readId(req);
  await service.deleteNotification(user.id, id);

  setAuditPayload(res, { resourceId: id });
  res.status(204).send();
});
