/**
 * Contrôleurs des documents PDF.
 *
 * Chaque handler :
 *  1. vérifie l'accès au document (un patient ne lit que ses propres pièces) ;
 *  2. génère le PDF ;
 *  3. l'envoie avec le bon en-tête de disposition ;
 *  4. journalise l'accès dans `audit_logs`.
 *
 * La journalisation d'audit ne doit jamais faire échouer la génération : elle
 * est appelée sans attendre et ses erreurs sont absorbées par `writeAuditLog`.
 */

import type { Request, RequestHandler } from 'express';

import { hasPermission } from '@mediclinic/shared';

import { requestContext, writeAuditLog } from '../../utils/audit-logger.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/http.js';
import * as service from './pdf.service.js';

/** Envoie le PDF (inline ou en pièce jointe) et journalise l'accès. */
function sendDocument(
  req: Request,
  document: service.GeneratedDocument,
  resource: string,
  resourceId: string | number,
  disposition: 'inline' | 'attachment',
): void {
  const context = requestContext(req);

  void writeAuditLog({
    userId: context.userId,
    action: 'PDF_ACCESS',
    resource,
    resourceId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  req.res?.setHeader('Content-Type', 'application/pdf');
  req.res?.setHeader('Content-Disposition', `${disposition}; filename="${document.filename}"`);
  req.res?.setHeader('Content-Length', String(document.buffer.length));
  req.res?.setHeader('Cache-Control', 'private, no-store');
  req.res?.send(document.buffer);
}

/** Libellé du générateur pour le pied de page. */
function generatedBy(req: Request): string {
  if (!req.user) return 'système';
  return `${req.user.firstName} ${req.user.lastName}`;
}

/**
 * Vérifie qu'un compte patient n'accède qu'à ses propres documents.
 * Le personnel dispose des permissions globales et n'est pas restreint ici.
 */
function assertOwnership(req: Request, ownerPatientId: number | null): void {
  const user = req.user;
  if (!user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');

  // Un patient est identifié par la présence du rôle PATIENT sans rôle staff.
  const isPatientOnly = user.roles.includes('PATIENT') && user.roles.length === 1;
  if (!isPatientOnly) return;

  if (user.patientId === null || ownerPatientId === null || user.patientId !== ownerPatientId) {
    throw AppError.forbidden('Ce document ne vous appartient pas.', 'DOCUMENT_NOT_OWNED');
  }
}

/* -------------------------------------------------------------------------- */
/* Route générique                                                             */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/pdf/:type/:id
 * Types : patient, prescription, dispensation, consultation, invoice.
 */
export const byType: RequestHandler = asyncHandler(async (req, res) => {
  const type = String(req.params.type ?? '') as service.DocumentType;
  if (!service.DOCUMENT_TYPES.includes(type)) {
    throw AppError.badRequest(
      `Type de document inconnu « ${type} ». Valeurs acceptées : ${service.DOCUMENT_TYPES.join(', ')}.`,
      'INVALID_DOCUMENT_TYPE',
    );
  }

  const id = Number.parseInt(String(req.params.id ?? ''), 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest('Identifiant de document invalide.', 'INVALID_ID');
  }

  const owner = await service.ownerPatientId(type, id);
  if (owner === null) throw AppError.notFound('Document introuvable.', 'DOCUMENT_NOT_FOUND');

  // La permission dépend du type : elle ne peut donc pas être posée en
  // middleware (le type n'est connu qu'ici). Le personnel doit détenir la
  // permission correspondante ; un patient passe par le contrôle de propriété.
  const required = service.DOCUMENT_PERMISSIONS[type];
  const isPatientOnly = (req.user?.roles.length ?? 0) === 1 && req.user?.roles.includes('PATIENT') === true;
  if (!isPatientOnly && req.user && !hasPermission(req.user.permissions, required)) {
    throw AppError.forbidden(`Permission requise : ${required}.`, 'PERMISSION_DENIED');
  }

  assertOwnership(req, owner);

  const document = await service.byType(type, id, generatedBy(req));

  // `res` est requis par `sendDocument` pour les en-têtes.
  const withRes = Object.assign(req, { res });
  sendDocument(withRes, document, type, id, 'inline');
});

/* -------------------------------------------------------------------------- */
/* Routes dédiées (téléchargement)                                             */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/invoices/:id/pdf
 * Télécharge la facture indiquée.
 */
export const invoicePdf: RequestHandler = asyncHandler(async (req, res) => {
  const id = Number.parseInt(String(req.params.id ?? ''), 10);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest('Identifiant invalide.', 'INVALID_ID');

  const owner = await service.ownerPatientId('invoice', id);
  if (owner === null) throw AppError.notFound('Facture introuvable.', 'INVOICE_NOT_FOUND');
  assertOwnership(req, owner);

  const document = await service.invoiceDocument(id, generatedBy(req));
  sendDocument(Object.assign(req, { res }), document, 'invoice', id, 'attachment');
});

/**
 * POST /api/consultations/:id/pdf
 * Télécharge le compte-rendu de consultation.
 */
export const consultationPdf: RequestHandler = asyncHandler(async (req, res) => {
  const id = Number.parseInt(String(req.params.id ?? ''), 10);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest('Identifiant invalide.', 'INVALID_ID');

  const owner = await service.ownerPatientId('consultation', id);
  if (owner === null) throw AppError.notFound('Consultation introuvable.', 'CONSULTATION_NOT_FOUND');
  assertOwnership(req, owner);

  const document = await service.consultationReport(id, generatedBy(req));
  sendDocument(Object.assign(req, { res }), document, 'consultation', id, 'attachment');
});

/**
 * GET /api/pdf/shifts/planning?from&to
 * Planning des gardes sur une période (mois courant par défaut).
 */
export const shiftPlanningPdf: RequestHandler = asyncHandler(async (req, res) => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const toIso = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const from = typeof req.query.from === 'string' && req.query.from !== '' ? req.query.from : toIso(firstDay);
  const to = typeof req.query.to === 'string' && req.query.to !== '' ? req.query.to : toIso(lastDay);

  const document = await service.shiftPlanning(from, to, generatedBy(req));
  sendDocument(Object.assign(req, { res }), document, 'shift', `${from}..${to}`, 'inline');
});
