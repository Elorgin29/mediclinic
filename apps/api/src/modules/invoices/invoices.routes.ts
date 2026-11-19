/**
 * Routes de la facturation, montées sur `/api/invoices`.
 *
 * L'ordre de déclaration est important : `/stats` et `/me` sont enregistrés
 * AVANT `/:id`, sinon Express interpréterait « stats » ou « me » comme un
 * identifiant de facture. De même, `/from-consultation/:consultationId` précède
 * les routes `/:id` pour rester lisible et sans ambiguïté.
 *
 * Chaîne de middlewares systématique :
 *   authenticate → requirePermission → validate → auditTrail → contrôleur
 */

import { invoiceQuerySchema } from '@mediclinic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './invoices.controller.js';

export const invoicesRouter = Router();

/** Schéma d'identifiant de route (`:id` entier positif, déjà coercé). */
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** Schéma du paramètre `:consultationId` de la génération depuis une consultation. */
const consultationParamSchema = z.object({
  consultationId: z.coerce.number().int().positive(),
});

/**
 * Booléen de query string strict (`true`/`1`/`false`/`0`).
 * `z.coerce.boolean()` est inutilisable ici : il convertirait « false » en `true`.
 */
const queryBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

/** Filtres de liste : le schéma partagé est complété du filtre `overdue`. */
const invoiceListQuerySchema = invoiceQuerySchema.extend({
  overdue: queryBooleanSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* Lectures — déclarées avant `/:id`                                           */
/* -------------------------------------------------------------------------- */

/** Liste paginée des factures (vue `v_invoice_details`). */
invoicesRouter.get(
  '/',
  authenticate,
  requirePermission('invoice:read'),
  validate({ query: invoiceListQuerySchema }),
  controller.list,
);

/** Indicateurs consolidés de la facturation (stats du tableau de bord). */
invoicesRouter.get(
  '/stats',
  authenticate,
  requirePermission('invoice:read'),
  controller.stats,
);

/** Factures du patient connecté (portail patient, pas de permission staff). */
invoicesRouter.get('/me', authenticate, controller.me);

/* -------------------------------------------------------------------------- */
/* Génération depuis une consultation                                          */
/* -------------------------------------------------------------------------- */

/**
 * Facture d'une consultation (honoraires du médecin + actes complémentaires).
 * Le corps est validé dans le contrôleur : il est entièrement facultatif.
 */
invoicesRouter.post(
  '/from-consultation/:consultationId',
  authenticate,
  requirePermission('invoice:create'),
  validate({ params: consultationParamSchema }),
  auditTrail('CREATE', 'invoice'),
  controller.fromConsultation,
);

/* -------------------------------------------------------------------------- */
/* Détail et écritures                                                         */
/* -------------------------------------------------------------------------- */

/** Facture complète (lignes + paiements). */
invoicesRouter.get(
  '/:id',
  authenticate,
  requirePermission('invoice:read'),
  validate({ params: idParamSchema }),
  controller.detail,
);

/** Création d'une facture et de ses lignes (transaction). */
invoicesRouter.post(
  '/',
  authenticate,
  requirePermission('invoice:create'),
  auditTrail('CREATE', 'invoice'),
  controller.create,
);

/** Mise à jour de la TVA, de l'échéance et éventuellement des lignes. */
invoicesRouter.patch(
  '/:id',
  authenticate,
  requirePermission('invoice:update'),
  validate({ params: idParamSchema }),
  auditTrail('UPDATE', 'invoice'),
  controller.update,
);

/** Annulation ou réémission d'une facture. */
invoicesRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('invoice:manage'),
  validate({ params: idParamSchema }),
  auditTrail('UPDATE', 'invoice'),
  controller.changeStatus,
);

/** Suppression physique (refusée dès qu'un paiement existe). */
invoicesRouter.delete(
  '/:id',
  authenticate,
  requirePermission('invoice:delete'),
  validate({ params: idParamSchema }),
  auditTrail('DELETE', 'invoice'),
  controller.remove,
);
