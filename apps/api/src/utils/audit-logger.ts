/**
 * Écriture du journal d'audit.
 *
 * Fonction bas niveau volontairement isolée des modules : elle est utilisée
 * aussi bien par le middleware `auditTrail` que directement par les services
 * (connexions, téléchargements de PDF, approbations…).
 *
 * IMPORTANT : une erreur d'écriture d'audit ne doit JAMAIS faire échouer la
 * requête métier. Toutes les erreurs sont donc capturées et journalisées.
 */

import type { Request } from 'express';

import { execute } from '../config/db.js';
import type { AuditEntry, RequestContext } from '../types/auth.js';

/** Extrait l'adresse IP et l'agent utilisateur d'une requête Express. */
export function requestContext(req: Request): RequestContext {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
  const ipAddress = forwardedIp ?? req.ip ?? req.socket.remoteAddress ?? null;

  return {
    ipAddress: ipAddress === undefined ? null : ipAddress,
    userAgent: req.get('user-agent') ?? null,
    userId: req.user?.id ?? null,
  };
}

/** Insère une entrée dans `audit_logs`. Ne lève jamais d'exception. */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await execute(
      `INSERT INTO audit_logs
         (user_id, action, resource, resource_id, old_value, new_value, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.userId ?? null,
        entry.action,
        entry.resource,
        entry.resourceId === undefined || entry.resourceId === null ? null : String(entry.resourceId),
        serializeJson(entry.oldValue),
        serializeJson(entry.newValue),
        entry.ipAddress ?? null,
        entry.userAgent?.slice(0, 255) ?? null,
      ],
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[audit] échec de l’écriture du journal :', error);
  }
}

/** Sérialise une valeur pour une colonne JSON MySQL. */
function serializeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}
