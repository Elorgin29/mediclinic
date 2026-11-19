/**
 * Agrégation de toutes les routes de l'API sous le préfixe `/api`.
 *
 * Chaque module expose un `Router` dédié ; ce fichier ne fait que les monter.
 * L'ordre de montage n'a pas d'importance tant que les chemins sont distincts,
 * à une exception près : `pdfRouter` doit être monté avant les routeurs qui
 * exposent `/invoices/:id/pdf` et `/consultations/:id/pdf` s'ils existent,
 * faute de quoi la route la plus générique capterait la requête. Ici les
 * chemins sont disjoints, l'ordre reste donc neutre.
 */

import { Router } from 'express';

import { testConnection } from '../config/db.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/http.js';

/* -------------------------------------------------------------------------- */
/* Modules                                                                     */
/* -------------------------------------------------------------------------- */
import { appointmentsRouter } from '../modules/appointments/appointments.routes.js';
import { auditRouter } from '../modules/audit/audit.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { consultationsRouter } from '../modules/consultations/consultations.routes.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { departmentsRouter } from '../modules/departments/departments.routes.js';
import { doctorsRouter } from '../modules/doctors/doctors.routes.js';
import { invoicesRouter } from '../modules/invoices/invoices.routes.js';
import { labRouter } from '../modules/lab/lab.routes.js';
import { medicationsRouter } from '../modules/medications/medications.routes.js';
import { meetingsRouter } from '../modules/meetings/meetings.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';
import { patientsRouter } from '../modules/patients/patients.routes.js';
import { paymentsRouter } from '../modules/payments/payments.routes.js';
import { pdfRouter } from '../modules/pdf/pdf.routes.js';
import { permissionsRouter } from '../modules/permissions/permissions.routes.js';
import { prescriptionsRouter } from '../modules/prescriptions/prescriptions.routes.js';
import { reportsRouter } from '../modules/reports/reports.routes.js';
import { rolesRouter } from '../modules/roles/roles.routes.js';
import { settingsRouter } from '../modules/settings/settings.routes.js';
import { shiftsRouter } from '../modules/shifts/shifts.routes.js';
import { specialtiesRouter } from '../modules/specialties/specialties.routes.js';
import { stockRouter } from '../modules/stock/stock.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';

export const apiRouter = Router();

/**
 * GET /api/health
 * Sonde de disponibilité : état du serveur, de la base et du mode Zoom.
 */
apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const database = await testConnection();
    res.status(database.ok ? 200 : 503).json({
      data: {
        status: database.ok ? 'ok' : 'degraded',
        database: database.ok ? 'connected' : 'unreachable',
        databaseVersion: database.version ?? null,
        zoom: env.zoomEnabled ? 'configured' : 'simulated',
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
    });
  }),
);

/* -------------------------------------------------------------------------- */
/* Authentification et comptes                                                 */
/* -------------------------------------------------------------------------- */
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/roles', rolesRouter);
apiRouter.use('/permissions', permissionsRouter);

/* -------------------------------------------------------------------------- */
/* Organisation médicale                                                       */
/* -------------------------------------------------------------------------- */
apiRouter.use('/specialties', specialtiesRouter);
apiRouter.use('/departments', departmentsRouter);
apiRouter.use('/doctors', doctorsRouter);

/* -------------------------------------------------------------------------- */
/* Parcours de soin                                                            */
/* -------------------------------------------------------------------------- */
apiRouter.use('/patients', patientsRouter);
apiRouter.use('/appointments', appointmentsRouter);
apiRouter.use('/consultations', consultationsRouter);
apiRouter.use('/prescriptions', prescriptionsRouter);
apiRouter.use('/meetings', meetingsRouter);
apiRouter.use('/lab', labRouter);

/* -------------------------------------------------------------------------- */
/* Pharmacie                                                                   */
/* -------------------------------------------------------------------------- */
apiRouter.use('/medications', medicationsRouter);
apiRouter.use('/stock', stockRouter);

/* -------------------------------------------------------------------------- */
/* Facturation                                                                 */
/* -------------------------------------------------------------------------- */
apiRouter.use('/invoices', invoicesRouter);
apiRouter.use('/payments', paymentsRouter);

/* -------------------------------------------------------------------------- */
/* Ressources humaines                                                         */
/* -------------------------------------------------------------------------- */
apiRouter.use('/shifts', shiftsRouter);

/* -------------------------------------------------------------------------- */
/* Pilotage                                                                    */
/* -------------------------------------------------------------------------- */
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/audit', auditRouter);

/* -------------------------------------------------------------------------- */
/* Transverse                                                                  */
/* -------------------------------------------------------------------------- */
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/settings', settingsRouter);

/**
 * Documents PDF.
 * Monté sur `/api` car le routeur déclare des chemins complets
 * (`/pdf/:type/:id`, `/invoices/:id/pdf`, …). Il est déclaré en dernier pour
 * que les routes métier plus spécifiques restent prioritaires.
 */
apiRouter.use('/', pdfRouter);
