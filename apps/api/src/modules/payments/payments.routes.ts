/**
 * Routes des encaissements, montées sur `/api/payments`.
 *
 * `/invoice/:invoiceId` est déclaré AVANT `/:id`, sinon Express interpréterait
 * « invoice » comme un identifiant de paiement.
 *
 * Chaîne de middlewares systématique :
 *   authenticate → requirePermission → validate → auditTrail → contrôleur
 */

import { Router } from 'express';
import { z } from 'zod';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './payments.controller.js';

export const paymentsRouter = Router();

/** Schéma d'identifiant de route (`:id` entier positif, déjà coercé). */
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** Schéma du paramètre `:invoiceId`. */
const invoiceParamSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
});

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Liste paginée des paiements (facture, patient et encaisseur inclus). */
paymentsRouter.get(
  '/',
  authenticate,
  requirePermission('payment:read'),
  controller.list,
);

/** Paiements d'une facture (déclaré avant `/:id`). */
paymentsRouter.get(
  '/invoice/:invoiceId',
  authenticate,
  requirePermission('payment:read'),
  validate({ params: invoiceParamSchema }),
  controller.byInvoice,
);

/** Détail d'un encaissement. */
paymentsRouter.get(
  '/:id',
  authenticate,
  requirePermission('payment:read'),
  validate({ params: idParamSchema }),
  controller.detail,
);

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Enregistrement d'un encaissement.
 * Le corps est validé dans le contrôleur (`createPaymentSchema` + `invoiceId`).
 */
paymentsRouter.post(
  '/',
  authenticate,
  requirePermission('payment:create'),
  auditTrail('CREATE', 'payment'),
  controller.create,
);

/** Suppression d'un encaissement (la facture est recalculée par trigger). */
paymentsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('payment:delete'),
  validate({ params: idParamSchema }),
  auditTrail('DELETE', 'payment'),
  controller.remove,
);
