/**
 * Contrôleurs HTTP des encaissements.
 *
 * Aucune règle métier ici : validation de l'entrée avec les schémas partagés,
 * appel au service, préparation de la charge d'audit, mise en forme de la
 * réponse. Le corps de création étend `createPaymentSchema` avec `invoiceId`,
 * absent du schéma partagé car la facture est un paramètre de la requête.
 */

import { createPaymentSchema, idSchema, listQuerySchema, PAYMENT_METHODS } from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/http.js';
import { paginated, parsePagination } from '../../utils/pagination.js';
import * as service from './payments.service.js';

/** Corps de `POST /api/payments` : le schéma partagé complété de `invoiceId`. */
const createPaymentInputSchema = createPaymentSchema.extend({
  invoiceId: idSchema,
});

/** Filtres de liste : pagination partagée + filtres métier. */
const paymentQuerySchema = listQuerySchema.extend({
  invoiceId: idSchema.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
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
 * GET /api/payments
 * Liste paginée ; chaque ligne porte `invoice_number` et `patient_name`.
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const query = paymentQuerySchema.parse(req.query);
  const pagination = parsePagination(query);

  const { data, total } = await service.listPayments(
    {
      invoiceId: query.invoiceId,
      method: query.method,
      from: query.from,
      to: query.to,
      search: query.search,
      sort: query.sort,
      order: query.order,
    },
    pagination,
  );

  res.json(paginated(data, total, pagination));
});

/**
 * GET /api/payments/invoice/:invoiceId
 * Paiements d'une facture. Déclaré avant `/:id`.
 */
export const byInvoice: RequestHandler = asyncHandler(async (req, res) => {
  const invoiceId = readId(req, 'invoiceId');
  const data = await service.listPaymentsForInvoice(invoiceId);
  res.json({ data });
});

/**
 * GET /api/payments/:id
 * Détail d'un encaissement.
 */
export const detail: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const payment = await service.getPayment(id);
  res.json({ data: payment });
});

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/payments
 * Enregistre un encaissement et renvoie l'état réel de la facture recalculé
 * par les triggers.
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const input = createPaymentInputSchema.parse(req.body);

  const result = await service.createPayment(input, user.id);

  setAuditPayload(res, {
    resourceId: result.payment.id,
    newValue: {
      invoice_id: result.payment.invoice_id,
      invoice_number: result.payment.invoice_number,
      amount: result.payment.amount,
      method: result.payment.method,
      paid_at: result.payment.paid_at,
      invoice_status: result.invoice.status,
      invoice_paid_amount: result.invoice.paid_amount,
    },
  });

  res.status(201).json({ data: result });
});

/**
 * DELETE /api/payments/:id
 * Supprime l'encaissement : la facture est automatiquement rééquilibrée.
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const payment = await service.deletePayment(id);

  setAuditPayload(res, {
    resourceId: id,
    oldValue: {
      invoice_id: payment.invoice_id,
      invoice_number: payment.invoice_number,
      amount: payment.amount,
      method: payment.method,
    },
  });

  res.status(204).send();
});
