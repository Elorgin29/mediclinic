/**
 * Routes du module « spécialités ».
 *
 * Ordre type d'une route d'écriture : `authenticate` → `requirePermission` →
 * `validate` → `auditTrail` → contrôleur. Les schémas viennent de
 * `@mediclinic/shared` (sauf composition locale, signalée comme telle).
 */

import {
  idSchema,
  listQuerySchema,
  specialtySchema,
  updateSpecialtySchema,
} from '@mediclinic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './specialties.controller.js';

export const specialtiesRouter = Router();

/**
 * Composition locale : `listQuerySchema.partial()` rend `page`, `limit` et
 * `order` réellement facultatifs. Le schéma partagé appliquerait sinon
 * `order = 'desc'` par défaut, ce qui casserait le tri alphabétique (ascendant)
 * attendu sur cette liste non paginée.
 */
const specialtyListQuerySchema = listQuerySchema.partial();

/** Paramètre de route `:id` converti en entier positif par le schéma partagé. */
const idParamsSchema = z.object({ id: idSchema });

/** Liste complète (compteurs de médecins et de rendez-vous). */
specialtiesRouter.get(
  '/',
  authenticate,
  requirePermission('specialty:read'),
  validate({ query: specialtyListQuerySchema }),
  controller.list,
);

/** Détail d'une spécialité. */
specialtiesRouter.get(
  '/:id',
  authenticate,
  requirePermission('specialty:read'),
  validate({ params: idParamsSchema }),
  controller.detail,
);

/** Création d'une spécialité. */
specialtiesRouter.post(
  '/',
  authenticate,
  requirePermission('specialty:create'),
  validate({ body: specialtySchema }),
  auditTrail('CREATE', 'specialty'),
  controller.create,
);

/** Mise à jour partielle d'une spécialité. */
specialtiesRouter.patch(
  '/:id',
  authenticate,
  requirePermission('specialty:update'),
  validate({ params: idParamsSchema, body: updateSpecialtySchema }),
  auditTrail('UPDATE', 'specialty'),
  controller.update,
);

/** Suppression d'une spécialité sans médecin rattaché. */
specialtiesRouter.delete(
  '/:id',
  authenticate,
  requirePermission('specialty:delete'),
  validate({ params: idParamsSchema }),
  auditTrail('DELETE', 'specialty'),
  controller.remove,
);
