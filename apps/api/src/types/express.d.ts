/**
 * Augmentation des types Express : `req.user` est renseigné par le middleware
 * `authenticate`, `res.locals.auditPayload` par les contrôleurs.
 */

import type { AuthUser, AuditPayload } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      /** Utilisateur authentifié (absent sur les routes publiques). */
      user?: AuthUser;
      /** Jeton d'accès brut, utile pour les téléchargements de PDF. */
      accessToken?: string;
    }

    interface Locals {
      /** Données d'audit à journaliser à la fin de la requête. */
      auditPayload?: AuditPayload;
      /** Identifiant de la ressource concernée par la requête. */
      auditResourceId?: string | number | null;
    }
  }
}

export {};
