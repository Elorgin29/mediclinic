/**
 * Contrôleurs HTTP de la facturation.
 *
 * Aucune règle métier ici : le contrôleur valide l'entrée avec les schémas
 * partagés, appelle le service, prépare la charge d'audit et met en forme la
 * réponse (`{ data }`, `{ data, meta }` ou 204).
 */

import {
  createInvoiceSchema,
  idSchema,
  invoiceQuerySchema,
  updateInvoiceSchema,
} from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler, parseBooleanQuery } from '../../utils/http.js';
import { paginated, parsePagination } from '../../utils/pagination.js';
import * as service from './invoices.service.js';

/** Corps de `POST /from-consultation/:consultationId` (tout est facultatif). */
const invoiceFromConsultationSchema = z.object({
  extraAmount: z.coerce.number().min(0, 'Le montant ne peut pas être négatif').optional(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
    .optional(),
});

/** Corps de `PATCH /:id/status` : annulation ou réémission uniquement. */
const invoiceStatusSchema = z.object({
  status: z.enum(['CANCELLED', 'ISSUED'], {
    errorMap: () => ({ message: 'Statut attendu : CANCELLED ou ISSUED' }),
  }),
});

/** Récupère l'utilisateur authentifié (garanti par le middleware `authenticate`). */
function requireUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  return req.user;
}

/** Lit et valide un paramètre de route entier. */
function readId(req: Request, name = 'id'): number {
  return idSchema.parse(req.params[name]);
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/invoices
 * Liste paginée issue de `v_invoice_details`, filtres statut, patient, période,
 * échéance dépassée et recherche (numéro ou nom du patient).
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const query = invoiceQuerySchema.parse(req.query);
  const pagination = parsePagination(query);

  const isPatientOnly = user.roles.includes('PATIENT') && !user.permissions.includes('patient:manage');
  const patientId = isPatientOnly ? (user.patientId ?? undefined) : query.patientId;

  const { data, total } = await service.listInvoices(
    {
      status: query.status,
      patientId,
      from: query.from,
      to: query.to,
      // `overdue` n'est pas dans le schéma partagé : lu tel quel, avec la
      // conversion booléenne commune (`true`, `1`, `oui`…).
      overdue: parseBooleanQuery((req.query as Record<string, unknown>).overdue),
      search: query.search,
      sort: query.sort,
      order: query.order,
    },
    pagination,
  );

  res.json(paginated(data, total, pagination));
});

/**
 * GET /api/invoices/stats
 * Indicateurs consolidés (montants convertis en nombres pour les graphiques).
 * Déclaré avant `/:id` pour ne pas être interprété comme un identifiant.
 */
export const stats: RequestHandler = asyncHandler(async (_req, res) => {
  const data = await service.getInvoiceStats();
  res.json({ data });
});

/**
 * GET /api/invoices/me
 * Factures du patient connecté (`req.user.patientId`).
 * Déclaré avant `/:id` pour la même raison.
 */
export const me: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const query = invoiceQuerySchema.parse(req.query);
  const pagination = parsePagination(query);

  const { data, total } = await service.listOwnInvoices(
    user.patientId,
    {
      status: query.status,
      patientId: query.patientId,
      from: query.from,
      to: query.to,
      overdue: parseBooleanQuery((req.query as Record<string, unknown>).overdue),
      search: query.search,
      sort: query.sort,
      order: query.order,
    },
    pagination,
  );

  res.json(paginated(data, total, pagination));
});

/**
 * GET /api/invoices/:id
 * Facture complète : en-tête, lignes et paiements (avec l'auteur de l'encaissement).
 */
export const detail: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = readId(req);
  const invoice = await service.getInvoice(id);
  const isPatientOnly = user.roles.includes('PATIENT') && !user.permissions.includes('patient:manage');
  if (isPatientOnly && user.patientId !== invoice.patient_id) {
    throw AppError.forbidden('Vous ne pouvez accéder qu’à vos propres factures.', 'NOT_YOUR_INVOICE');
  }
  res.json({ data: invoice });
});

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/invoices
 * Crée la facture et ses lignes dans une transaction, puis renvoie l'état réel
 * relu en base (les totaux sont produits par les triggers).
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const input = createInvoiceSchema.parse(req.body);
  const invoice = await service.createInvoice(input, user.id);

  setAuditPayload(res, {
    resourceId: invoice.id,
    newValue: {
      number: invoice.number,
      patient_id: invoice.patient_id,
      consultation_id: invoice.consultation_id,
      vat_rate: invoice.vat_rate,
      total_amount: invoice.total_amount,
      items: invoice.items.length,
    },
  });

  res.status(201).json({ data: invoice });
});

/**
 * PATCH /api/invoices/:id
 * Met à jour la TVA, l'échéance et, si fourni, remplace les lignes.
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const input = updateInvoiceSchema.parse(req.body);

  const before = await service.getInvoice(id);
  const invoice = await service.updateInvoice(id, input);

  setAuditPayload(res, {
    resourceId: id,
    oldValue: {
      vat_rate: before.vat_rate,
      due_date: before.due_date,
      total_amount: before.total_amount,
      items: before.items.length,
    },
    newValue: {
      vat_rate: invoice.vat_rate,
      due_date: invoice.due_date,
      total_amount: invoice.total_amount,
      items: invoice.items.length,
    },
  });

  res.json({ data: invoice });
});

/**
 * DELETE /api/invoices/:id
 * Suppression physique refusée dès qu'un paiement existe.
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const before = await service.getInvoice(id);

  await service.deleteInvoice(id);

  setAuditPayload(res, {
    resourceId: id,
    oldValue: { number: before.number, status: before.status, total_amount: before.total_amount },
  });

  res.status(204).send();
});

/**
 * PATCH /api/invoices/:id/status
 * Annule la facture ou la réémet (refus si des paiements existent).
 */
export const changeStatus: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const input = invoiceStatusSchema.parse(req.body);

  const before = await service.getInvoice(id);
  const invoice = await service.changeInvoiceStatus(id, input);

  setAuditPayload(res, {
    resourceId: id,
    oldValue: { status: before.status },
    newValue: { status: invoice.status },
  });

  res.json({ data: invoice });
});

/**
 * POST /api/invoices/from-consultation/:consultationId
 * Génère la facture d'une consultation à partir du tarif du médecin.
 */
export const fromConsultation: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const consultationId = readId(req, 'consultationId');
  const input = invoiceFromConsultationSchema.parse(req.body ?? {});

  const invoice = await service.createInvoiceFromConsultation(
    consultationId,
    input,
    user.id,
  );

  setAuditPayload(res, {
    resourceId: invoice.id,
    newValue: {
      number: invoice.number,
      consultation_id: consultationId,
      patient_id: invoice.patient_id,
      total_amount: invoice.total_amount,
      items: invoice.items.length,
    },
  });

  res.status(201).json({ data: invoice });
});
