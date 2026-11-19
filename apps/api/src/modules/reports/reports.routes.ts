/**
 * Routes des rapports (`/api/reports`).
 *
 * Toutes les routes exigent la permission `report:read`. La plage de dates est
 * optionnelle : en son absence, le service retombe sur le mois courant
 * (`defaultReportRange()`).
 *
 * `/export.csv` est déclaré en dernier : son chemin est littéral, mais il est
 * plus lisible de garder les rapports JSON groupés en tête.
 */

import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './reports.controller.js';

export const reportsRouter = Router();

/** Chiffre d'affaires encaissé sur la période. */
reportsRouter.get(
  '/revenue',
  authenticate,
  requirePermission('report:read'),
  validate({ query: controller.reportQuerySchema }),
  controller.revenue,
);

/** Statistiques de rendez-vous (regroupement au choix). */
reportsRouter.get(
  '/appointments',
  authenticate,
  requirePermission('report:read'),
  validate({ query: controller.appointmentReportQuerySchema }),
  controller.appointments,
);

/** État du stock, alertes et consommation. */
reportsRouter.get(
  '/stock',
  authenticate,
  requirePermission('report:read'),
  validate({ query: controller.reportQuerySchema }),
  controller.stock,
);

/** Activité du personnel (journal d'audit). */
reportsRouter.get(
  '/activity',
  authenticate,
  requirePermission('report:read'),
  validate({ query: controller.reportQuerySchema }),
  controller.activity,
);

/** Démographie des patients. */
reportsRouter.get(
  '/patients',
  authenticate,
  requirePermission('report:read'),
  validate({ query: controller.reportQuerySchema }),
  controller.patients,
);

/**
 * Export CSV (séparateur `;`, BOM UTF-8 pour Excel).
 * Le type est contrôlé dans le contrôleur, qui renvoie un 400 explicite.
 */
reportsRouter.get(
  '/export.csv',
  authenticate,
  requirePermission('report:read'),
  validate({ query: controller.reportExportQuerySchema }),
  controller.exportCsv,
);
