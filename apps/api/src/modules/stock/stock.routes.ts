/**
 * Routes de la vue transversale du stock, montées sur `/api/stock`.
 *
 * Toutes les routes sont en lecture (`stock:read`) : les écritures de stock
 * passent par `POST /api/medications/:id/adjust-stock` (ajustement manuel) ou
 * `POST /api/prescriptions/:id/dispense` (dispensation), seule façon de faire
 * varier `medications.stock_quantity` via les triggers.
 *
 * Ordre de déclaration : `/movements/:id` est enregistré APRÈS `/movements`,
 * et les chemins fixes (`/alerts`, `/summary`) avant toute route paramétrée.
 */

import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import * as controller from './stock.controller.js';

export const stockRouter = Router();

/* -------------------------------------------------------------------------- */
/* Mouvements                                                                 */
/* -------------------------------------------------------------------------- */

/** Historique paginé des mouvements de stock. */
stockRouter.get(
  '/movements',
  authenticate,
  requirePermission('stock:read'),
  controller.listMovements,
);

/** Un mouvement précis (déclaré après `/movements`). */
stockRouter.get(
  '/movements/:id',
  authenticate,
  requirePermission('stock:read'),
  controller.getMovement,
);

/* -------------------------------------------------------------------------- */
/* Alertes et indicateurs                                                     */
/* -------------------------------------------------------------------------- */

/** Alertes de stock : stock bas, péremption proche, périmés. */
stockRouter.get('/alerts', authenticate, requirePermission('stock:read'), controller.alerts);

/** Indicateurs agrégés du stock. */
stockRouter.get('/summary', authenticate, requirePermission('stock:read'), controller.summary);
