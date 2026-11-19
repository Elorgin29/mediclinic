/**
 * Routes du catalogue de médicaments (`/api/medications`).
 *
 * L'ordre de déclaration est important : `/categories` et `/low-stock` sont
 * déclarés AVANT `/:id`, sinon Express interpréterait « categories » comme un
 * identifiant.
 */

import { medicationQuerySchema } from '@mediclinic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './medications.controller.js';

export const medicationsRouter = Router();

/**
 * Booléen de query string strict (`true`/`1`/`false`/`0`).
 * `z.coerce.boolean()` est inutilisable ici : il convertirait la chaîne
 * `"false"` en `true`.
 */
const queryBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

/** Filtres de liste : le schéma partagé est complété des filtres de péremption. */
const medicationListQuerySchema = medicationQuerySchema.extend({
  expiringSoon: queryBooleanSchema.optional(),
  expired: queryBooleanSchema.optional(),
});

/** Schéma d'identifiant de route (`:id` entier positif, déjà coercé). */
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * Liste paginée des médicaments.
 * Les codes de réponse possibles sont documentés dans le README du module.
 */
medicationsRouter.get(
  '/',
  authenticate,
  requirePermission('medication:read'),
  validate({ query: medicationListQuerySchema }),
  controller.list,
);

/** Catégories distinctes (déclaré avant `/:id`). */
medicationsRouter.get(
  '/categories',
  authenticate,
  requirePermission('medication:read'),
  controller.categories,
);

/** Alertes de stock bas (déclaré avant `/:id`). */
medicationsRouter.get(
  '/low-stock',
  authenticate,
  requirePermission('medication:read'),
  controller.lowStock,
);

/** Fiche détaillée d'un médicament. */
medicationsRouter.get(
  '/:id',
  authenticate,
  requirePermission('medication:read'),
  validate({ params: idParamSchema }),
  controller.getById,
);

/**
 * Création d'un médicament (stock initial converti en mouvement `IN`).
 * Le corps est validé par `createMedicationSchema` dans le contrôleur.
 */
medicationsRouter.post(
  '/',
  authenticate,
  requirePermission('medication:create'),
  auditTrail('CREATE', 'medication'),
  controller.create,
);

/** Mise à jour de la fiche (jamais la quantité en stock). */
medicationsRouter.patch(
  '/:id',
  authenticate,
  requirePermission('medication:update'),
  validate({ params: idParamSchema }),
  auditTrail('UPDATE', 'medication'),
  controller.update,
);

/** Suppression physique (refusée si un historique existe). */
medicationsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('medication:delete'),
  validate({ params: idParamSchema }),
  auditTrail('DELETE', 'medication'),
  controller.remove,
);

/** Ajustement de stock : seule voie de modification du stock. */
medicationsRouter.post(
  '/:id/adjust-stock',
  authenticate,
  requirePermission('stock:manage'),
  validate({ params: idParamSchema }),
  auditTrail('STOCK_ADJUST', 'stock'),
  controller.adjustStock,
);

/** Historique paginé des mouvements du médicament. */
medicationsRouter.get(
  '/:id/movements',
  authenticate,
  requirePermission('stock:read'),
  validate({ params: idParamSchema }),
  controller.movements,
);
