/**
 * Contrôleurs HTTP des rapports (`/api/reports`).
 *
 * Aucune règle métier ici : le contrôleur lit la plage demandée, appelle le
 * service et met en forme la réponse. L'export CSV est le seul handler qui
 * écrit un corps non JSON : il pose les en-têtes attendus par Excel et
 * préfixe le contenu d'un BOM UTF-8.
 */

import { reportRangeSchema } from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../utils/http.js';
import * as service from './reports.service.js';

/* -------------------------------------------------------------------------- */
/* Schémas d'entrée                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Plage de rapport : `reportRangeSchema` est rendu partiel, car l'absence de
 * bornes doit retomber sur `defaultReportRange()` (mois courant) et non
 * provoquer une erreur de validation.
 */
export const reportQuerySchema = reportRangeSchema.partial();

/** Rapport des rendez-vous : la plage est complétée de l'axe de regroupement. */
export const appointmentReportQuerySchema = reportQuerySchema.extend({
  groupBy: z.enum(['day', 'week', 'month', 'department', 'doctor', 'status']).optional(),
});

/** Export CSV : la plage est complétée du type et de l'axe éventuel. */
export const reportExportQuerySchema = reportQuerySchema.extend({
  type: z.string().trim().min(1, 'Le type d’export est obligatoire'),
  groupBy: z.enum(['day', 'week', 'month', 'department', 'doctor', 'status']).optional(),
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Lit `from` / `to` depuis la query string (chaînes uniquement). */
function readRange(req: Request): { from?: string; to?: string } {
  const query = req.query as Record<string, unknown>;
  return {
    ...(typeof query.from === 'string' && query.from.length > 0 ? { from: query.from } : {}),
    ...(typeof query.to === 'string' && query.to.length > 0 ? { to: query.to } : {}),
  };
}

/** Retire les accents et caractères non sûrs d'un segment de nom de fichier. */
function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9-]/g, '-');
}

/* -------------------------------------------------------------------------- */
/* Rapports                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/reports/revenue
 * Chiffre d'affaires encaissé, réparti par mois, moyen de paiement et statut.
 */
export const revenue: RequestHandler = asyncHandler(async (req, res) => {
  const report = await service.getRevenueReport(readRange(req));
  res.json({ data: report });
});

/**
 * GET /api/reports/appointments?groupBy=day|week|month|department|doctor|status
 * Statistiques de rendez-vous et regroupements (liste blanche d'axes).
 */
export const appointments: RequestHandler = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const groupBy = typeof query.groupBy === 'string' ? query.groupBy : undefined;

  const report = await service.getAppointmentReport({ ...readRange(req), ...(groupBy ? { groupBy } : {}) });
  res.json({ data: report });
});

/**
 * GET /api/reports/stock
 * État du stock, alertes, périmés, mouvements et consommation.
 */
export const stock: RequestHandler = asyncHandler(async (req, res) => {
  const report = await service.getStockReport(readRange(req));
  res.json({ data: report });
});

/**
 * GET /api/reports/activity
 * Actions journalisées, par action, ressource, utilisateur et jour.
 */
export const activity: RequestHandler = asyncHandler(async (req, res) => {
  const report = await service.getActivityReport(readRange(req));
  res.json({ data: report });
});

/**
 * GET /api/reports/patients
 * Nouveaux dossiers et répartitions démographiques.
 */
export const patients: RequestHandler = asyncHandler(async (req, res) => {
  const report = await service.getPatientReport(readRange(req));
  res.json({ data: report });
});

/* -------------------------------------------------------------------------- */
/* Export CSV                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/reports/export.csv?type=revenue|appointments|stock|activity
 *
 * Le BOM UTF-8 (`\uFEFF`) est indispensable pour qu'Excel reconnaisse
 * l'encodage et affiche correctement les accents. Le séparateur est le
 * point-virgule, conformément aux paramètres régionaux francophones.
 */
export const exportCsv: RequestHandler = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const type = typeof query.type === 'string' ? query.type : '';

  if (!service.isExportType(type)) {
    res.status(400).json({
      error: {
        code: 'INVALID_EXPORT_TYPE',
        message: `Type d’export inconnu « ${type} ». Valeurs acceptées : ${service.EXPORT_TYPES.join(', ')}.`,
      },
    });
    return;
  }

  const groupBy = typeof query.groupBy === 'string' ? query.groupBy : undefined;
  const { content, range } = await service.buildCsv(type, {
    ...readRange(req),
    ...(groupBy === undefined ? {} : { groupBy }),
  });

  const filename = `rapport-${slug(type)}-${range.from}-${range.to}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(`\uFEFF${content}`);
});
