/**
 * Routes du module des rôles, montées sur `/api/roles`.
 *
 * L'ordre de déclaration compte : `/:id/permissions` est enregistré avec le
 * verbe `PUT`/`GET` sur un chemin plus spécifique que `/:id`, mais les deux
 * restent distincts par la méthode et la profondeur du chemin.
 *
 * Toutes les routes exigent une session valide ; chaque opération est en plus
 * protégée par la permission RBAC correspondante.
 */

import { createRoleSchema, idSchema, updateRoleSchema } from '@mediclinic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middlewares/auth.middleware.js';
import { auditTrail } from '../../middlewares/audit.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './roles.controller.js';

export const rolesRouter = Router();

/** Paramètre d'identifiant commun aux routes `/:id`. */
const idParamsSchema = z.object({ id: idSchema });

/**
 * Corps de `PUT /:id/permissions`.
 * Déclaré localement : la matrice seule est modifiable par cette route, le
 * reste du rôle passant par `PATCH /:id`.
 */
const replacePermissionsSchema = z.object({
  permissionIds: z.array(idSchema),
});

/** Toutes les routes du module exigent une session valide. */
rolesRouter.use(authenticate);

/** Liste des rôles avec leurs compteurs d'utilisation. */
rolesRouter.get('/', requirePermission('role:read'), controller.list);

/** Permissions d'un rôle (déclaré avant `/:id` par lisibilité). */
rolesRouter.get(
  '/:id/permissions',
  requirePermission('role:read'),
  validate({ params: idParamsSchema }),
  controller.permissions,
);

/** Détail d'un rôle et de sa matrice de permissions. */
rolesRouter.get(
  '/:id',
  requirePermission('role:read'),
  validate({ params: idParamsSchema }),
  controller.getById,
);

/** Création d'un rôle personnalisé. */
rolesRouter.post(
  '/',
  requirePermission('role:create'),
  validate({ body: createRoleSchema }),
  auditTrail('CREATE', 'role'),
  controller.create,
);

/** Mise à jour partielle (nom, description, matrice de permissions). */
rolesRouter.patch(
  '/:id',
  requirePermission('role:update'),
  validate({ params: idParamsSchema, body: updateRoleSchema }),
  auditTrail('UPDATE', 'role'),
  controller.update,
);

/** Suppression d'un rôle personnalisé inutilisé. */
rolesRouter.delete(
  '/:id',
  requirePermission('role:delete'),
  validate({ params: idParamsSchema }),
  auditTrail('DELETE', 'role'),
  controller.remove,
);

/** Remplacement intégral de la matrice de permissions d'un rôle. */
rolesRouter.put(
  '/:id/permissions',
  requirePermission('role:manage'),
  validate({ params: idParamsSchema, body: replacePermissionsSchema }),
  auditTrail('APPROVE', 'role'),
  controller.replacePermissions,
);
