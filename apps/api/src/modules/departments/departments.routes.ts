/**
 * Routes du module « départements ».
 *
 * Ordre type d'une route d'écriture : `authenticate` → `requirePermission` →
 * `validate` → `auditTrail` → contrôleur.
 */

import { departmentSchema, idSchema, listQuerySchema, updateDepartmentSchema } from '@mediclinic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './departments.controller.js';

export const departmentsRouter = Router();

/**
 * Composition locale : `listQuerySchema.partial()` rend `page`, `limit` et
 * `order` réellement facultatifs. Le schéma partagé appliquerait sinon
 * `order = 'desc'` par défaut, ce qui casserait le tri alphabétique attendu.
 */
const departmentListQuerySchema = listQuerySchema.partial();

/** Paramètre de route `:id` converti en entier positif par le schéma partagé. */
const idParamsSchema = z.object({ id: idSchema });

/** Liste des départements (chef + nombre de médecins). */
departmentsRouter.get(
  '/',
  authenticate,
  requirePermission('department:read'),
  validate({ query: departmentListQuerySchema }),
  controller.list,
);

/** Détail d'un département et de ses médecins. */
departmentsRouter.get(
  '/:id',
  authenticate,
  requirePermission('department:read'),
  validate({ params: idParamsSchema }),
  controller.detail,
);

/** Création d'un département. */
departmentsRouter.post(
  '/',
  authenticate,
  requirePermission('department:create'),
  validate({ body: departmentSchema }),
  auditTrail('CREATE', 'department'),
  controller.create,
);

/** Mise à jour partielle d'un département (chef inclus). */
departmentsRouter.patch(
  '/:id',
  authenticate,
  requirePermission('department:update'),
  validate({ params: idParamsSchema, body: updateDepartmentSchema }),
  auditTrail('UPDATE', 'department'),
  controller.update,
);

/** Suppression d'un département sans historique rattaché. */
departmentsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('department:delete'),
  validate({ params: idParamsSchema }),
  auditTrail('DELETE', 'department'),
  controller.remove,
);
