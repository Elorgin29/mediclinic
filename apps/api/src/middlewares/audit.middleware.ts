/**
 * Middleware d'audit automatique des routes modificatrices.
 *
 * Principe : le middleware s'installe en amont de la route et prépare
 * l'écriture du journal. Le contrôleur, s'il le souhaite, enrichit le contenu
 * via `res.locals.auditPayload` (identifiant de la ressource, ancienne et
 * nouvelle valeur). Le journal n'est écrit que si la requête aboutit
 * (statut HTTP < 400) : inutile de tracer les tentatives refusées, qui sont
 * déjà tracées par les erreurs.
 *
 * @example
 * router.post('/', requirePermission('patient:create'), auditTrail('CREATE', 'patient'), …)
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { requestContext, writeAuditLog } from '../utils/audit-logger.js';

/** Installe la journalisation d'audit pour l'action et la ressource données. */
export function auditTrail(action: string, resource: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;

      const payload = res.locals.auditPayload;
      const context = requestContext(req);
      const resourceId =
        payload?.resourceId ?? res.locals.auditResourceId ?? req.params.id ?? null;

      void writeAuditLog({
        userId: context.userId,
        action: payload?.action ?? action,
        resource: payload?.resource ?? resource,
        resourceId,
        oldValue: payload?.oldValue,
        newValue: payload?.newValue,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    });

    next();
  };
}

/**
 * Prépare une entrée d'audit personnalisée depuis un contrôleur.
 * L'entrée est écrite à la fin de la requête par `auditTrail`.
 */
export function setAuditPayload(
  res: Response,
  payload: {
    action?: string;
    resource?: string;
    resourceId?: string | number | null;
    oldValue?: unknown;
    newValue?: unknown;
  },
): void {
  res.locals.auditPayload = {
    action: payload.action ?? res.locals.auditPayload?.action ?? 'UPDATE',
    resource: payload.resource ?? res.locals.auditPayload?.resource ?? 'unknown',
    resourceId: payload.resourceId,
    oldValue: payload.oldValue,
    newValue: payload.newValue,
  };
}
