/**
 * Routes des notifications internes, montées sur `/api/notifications`.
 *
 * `/unread-count` et `/read-all` sont déclarés AVANT `/:id`, sinon Express
 * interpréterait « unread-count » comme un identifiant numérique (rejeté par la
 * validation, mais avec un message trompeur).
 *
 * Particularité : la lecture et la mise à jour ne demandent qu'un compte
 * authentifié, puis le service cloisonne par `req.user.id`. La permission
 * `notification:read` / `notification:update` reste néanmoins exigée pour
 * rester cohérent avec la matrice RBAC ; l'envoi groupé exige `user:manage`.
 */

import { Router } from 'express';
import { z } from 'zod';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './notifications.controller.js';

export const notificationsRouter = Router();

/** Schéma d'identifiant de route (`:id` entier positif, déjà coercé). */
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Liste paginée des notifications de l'utilisateur connecté. */
notificationsRouter.get(
  '/',
  authenticate,
  requirePermission('notification:read'),
  controller.list,
);

/** Compteur des notifications non lues (déclaré avant `/:id`). */
notificationsRouter.get(
  '/unread-count',
  authenticate,
  requirePermission('notification:read'),
  controller.unreadCount,
);

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Envoi interne d'une notification par un administrateur.
 * Le corps est validé dans le contrôleur (schéma local, hors `@mediclinic/shared`).
 */
notificationsRouter.post(
  '/',
  authenticate,
  requirePermission('user:manage'),
  auditTrail('CREATE', 'notification'),
  controller.broadcast,
);

/** Marque toutes les notifications comme lues (déclaré avant `/:id`). */
notificationsRouter.post(
  '/read-all',
  authenticate,
  requirePermission('notification:update'),
  auditTrail('UPDATE', 'notification'),
  controller.readAll,
);

/** Marque une notification comme lue (403 si elle appartient à un autre compte). */
notificationsRouter.patch(
  '/:id/read',
  authenticate,
  requirePermission('notification:update'),
  validate({ params: idParamSchema }),
  auditTrail('UPDATE', 'notification'),
  controller.markRead,
);

/** Suppression d'une notification personnelle. */
notificationsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('notification:delete'),
  validate({ params: idParamSchema }),
  auditTrail('DELETE', 'notification'),
  controller.remove,
);
