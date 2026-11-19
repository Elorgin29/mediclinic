/**
 * Routes des documents PDF.
 *
 * Ce routeur est monté sur `/api` : ses chemins sont donc **complets**.
 *
 * ORDRE CRITIQUE : `/pdf/shifts/planning` doit être déclaré avant
 * `/pdf/:type/:id`, sinon « shifts » serait interprété comme un type de
 * document et la route générique renverrait 400.
 */

import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import * as controller from './pdf.controller.js';

export const pdfRouter = Router();

/* -------------------------------------------------------------------------- */
/* Planning des gardes — avant la route générique                              */
/* -------------------------------------------------------------------------- */
pdfRouter.get(
  '/pdf/shifts/planning',
  authenticate,
  requirePermission('shift:read'),
  controller.shiftPlanningPdf,
);

/* -------------------------------------------------------------------------- */
/* Routes dédiées au téléchargement                                            */
/* -------------------------------------------------------------------------- */
pdfRouter.post(
  '/invoices/:id/pdf',
  authenticate,
  requirePermission('invoice:read'),
  controller.invoicePdf,
);

pdfRouter.post(
  '/consultations/:id/pdf',
  authenticate,
  requirePermission('consultation:read'),
  controller.consultationPdf,
);

/* -------------------------------------------------------------------------- */
/* Route générique : /pdf/<type>/<id>                                          */
/* -------------------------------------------------------------------------- */
pdfRouter.get(
  '/pdf/:type/:id',
  authenticate,
  // L'authentification est requise ; la permission fine dépend du type et est
  // contrôlée dans le service après résolution du type (une permission unique
  // ne peut pas couvrir les cinq types ici).
  controller.byType,
);
