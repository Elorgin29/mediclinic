/**
 * Routes du module de gestion des utilisateurs.
 *
 * L'ordre de déclaration compte : `/me/profile` est enregistré AVANT `/:id`,
 * sinon Express interpréterait « me » comme un identifiant d'utilisateur.
 */

import { createUserSchema, idSchema, listQuerySchema, updateUserSchema } from '@mediclinic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middlewares/auth.middleware.js';
import { auditTrail } from '../../middlewares/audit.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './users.controller.js';

export const usersRouter = Router();

/** Paramètre d'identifiant commun aux routes `/:id`. */
const idParamsSchema = z.object({ id: idSchema });

/**
 * Filtres de la liste : pagination, recherche et tri partagés, complétés par
 * les filtres propres au module.
 *
 * `isActive` est décodé explicitement : `z.coerce.boolean()` interpréterait la
 * chaîne « false » comme `true`, ce qui inverserait le filtre.
 */
const usersQuerySchema = listQuerySchema.extend({
  role: z.string().trim().max(50).optional(),
  isActive: z
    .union([z.literal(''), z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) =>
      value === '' ? undefined : typeof value === 'boolean' ? value : value === 'true' || value === '1',
    )
    .optional(),
});

/** Corps de la réinitialisation : mot de passe optionnel (seed sinon). */
const resetPasswordSchema = updateUserSchema.pick({ password: true });

/** Toutes les routes du module exigent une session valide. */
usersRouter.use(authenticate);

/** Profil de l'utilisateur connecté (déclaré avant `/:id`). */
usersRouter.get('/me/profile', controller.profile);

/** Liste paginée et recherche. */
usersRouter.get(
  '/',
  requirePermission('user:read'),
  validate({ query: usersQuerySchema }),
  controller.list,
);

/** Fiche d'un utilisateur. */
usersRouter.get(
  '/:id',
  requirePermission('user:read'),
  validate({ params: idParamsSchema }),
  controller.getById,
);

/** Rôles et permissions effectifs d'un utilisateur. */
usersRouter.get(
  '/:id/permissions',
  requirePermission('user:read'),
  validate({ params: idParamsSchema }),
  controller.permissions,
);

/** Création d'un compte. */
usersRouter.post(
  '/',
  requirePermission('user:create'),
  validate({ body: createUserSchema }),
  auditTrail('CREATE', 'user'),
  controller.create,
);

/** Mise à jour partielle (rôles compris). */
usersRouter.patch(
  '/:id',
  requirePermission('user:update'),
  validate({ params: idParamsSchema, body: updateUserSchema }),
  auditTrail('UPDATE', 'user'),
  controller.update,
);

/** Désactivation logique d'un compte. */
usersRouter.delete(
  '/:id',
  requirePermission('user:delete'),
  validate({ params: idParamsSchema }),
  auditTrail('DELETE', 'user'),
  controller.remove,
);

/** Réinitialisation du mot de passe d'un compte. */
usersRouter.post(
  '/:id/reset-password',
  requirePermission('user:manage'),
  validate({ params: idParamsSchema, body: resetPasswordSchema }),
  auditTrail('UPDATE', 'user'),
  controller.resetPassword,
);
