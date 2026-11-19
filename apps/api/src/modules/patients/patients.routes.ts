/**
 * Routes du module patients, montées sur `/api/patients`.
 *
 * Ordre de déclaration important : les routes du portail patient (`/me`)
 * sont enregistrées AVANT les routes paramétrées (`/:id`), sinon Express
 * interpréterait « me » comme un identifiant.
 *
 * Chaîne de middlewares systématique :
 *   authenticate → requirePermission → auditTrail → contrôleur
 * (la validation Zod est faite par le contrôleur avec les schémas partagés,
 * comme dans le module d'authentification de référence).
 */

import { Router } from 'express';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import * as controller from './patients.controller.js';

export const patientsRouter = Router();

/* -------------------------------------------------------------------------- */
/* Portail patient — déclaré en premier pour primer sur `/:id`                 */
/* -------------------------------------------------------------------------- */

/** Dossier du patient connecté. */
patientsRouter.get('/me', authenticate, requirePermission('patient:read'), controller.me);

/** Mise à jour du profil par le patient connecté. */
patientsRouter.patch(
  '/me',
  authenticate,
  requirePermission('patient:update'),
  auditTrail('UPDATE', 'patient'),
  controller.updateMe,
);

/* -------------------------------------------------------------------------- */
/* Personnel — liste et création                                               */
/* -------------------------------------------------------------------------- */

/** Liste paginée des patients. */
patientsRouter.get('/', authenticate, requirePermission('patient:read'), controller.list);

/** Création d'un dossier patient. */
patientsRouter.post(
  '/',
  authenticate,
  requirePermission('patient:create'),
  auditTrail('CREATE', 'patient'),
  controller.create,
);

/* -------------------------------------------------------------------------- */
/* Sous-ressources d'un patient                                                */
/* -------------------------------------------------------------------------- */

/** Chronologie complète du dossier. */
patientsRouter.get(
  '/:id/history',
  authenticate,
  requirePermission('patient:read'),
  controller.history,
);

/** Rendez-vous paginés d'un patient. */
patientsRouter.get(
  '/:id/appointments',
  authenticate,
  requirePermission('patient:read'),
  controller.appointments,
);

/** Création du compte portail d'un patient existant. */
patientsRouter.post(
  '/:id/account',
  authenticate,
  requirePermission('user:create'),
  auditTrail('CREATE', 'patient'),
  controller.createAccount,
);

/* -------------------------------------------------------------------------- */
/* Détail et écritures sur un patient                                          */
/* -------------------------------------------------------------------------- */

/** Détail d'un dossier. */
patientsRouter.get('/:id', authenticate, requirePermission('patient:read'), controller.detail);

/** Mise à jour partielle d'un dossier. */
patientsRouter.patch(
  '/:id',
  authenticate,
  requirePermission('patient:update'),
  auditTrail('UPDATE', 'patient'),
  controller.update,
);

/** Suppression d'un dossier sans historique. */
patientsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('patient:delete'),
  auditTrail('DELETE', 'patient'),
  controller.remove,
);
