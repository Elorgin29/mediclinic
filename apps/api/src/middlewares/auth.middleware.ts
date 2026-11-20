/**
 * Middleware d'authentification.
 *
 * Le jeton d'accès est lu dans l'en-tête `Authorization: Bearer …`.
 * Exception pratique : pour les téléchargements de PDF ouverts directement
 * dans un nouvel onglet (où l'on ne peut pas poser d'en-tête), un jeton peut
 * être passé en paramètre de requête `?token=…` sur les méthodes GET.
 *
 * Les rôles et permissions sont rechargés depuis la base à chaque requête :
 * une révocation ou un changement de rôle est donc pris en compte
 * immédiatement, sans attendre l'expiration du jeton (15 minutes).
 */

import type { NextFunction, Request, Response } from 'express';

import { queryOne, type Row } from '../config/db.js';
import { verifyAccessToken } from '../config/jwt.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/app-error.js';

/** Ligne renvoyée par la requête d'identité (un utilisateur = une ligne). */
interface IdentityRow extends Row {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_active: number;
  patient_id: number | null;
  doctor_id: number | null;
  roles: string | null;
  permissions: string | null;
}

/**
 * Requête unique d'identité : utilisateur + rôles + permissions + rattachements.
 * `GROUP_CONCAT(DISTINCT …)` évite l'explosion du produit cartésien entre
 * rôles et permissions.
 */
const IDENTITY_SQL = `
  SELECT
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.is_active,
    pat.id AS patient_id,
    doc.id AS doctor_id,
    GROUP_CONCAT(DISTINCT r.code ORDER BY r.code SEPARATOR ',')      AS roles,
    GROUP_CONCAT(DISTINCT perm.code ORDER BY perm.code SEPARATOR ',') AS permissions
  FROM users u
  LEFT JOIN user_roles ur       ON ur.user_id = u.id
  LEFT JOIN roles r             ON r.id = ur.role_id
  LEFT JOIN role_permissions rp ON rp.role_id = r.id
  LEFT JOIN permissions perm    ON perm.id = rp.permission_id
  LEFT JOIN patients pat        ON pat.user_id = u.id
  LEFT JOIN doctors doc         ON doc.user_id = u.id
  WHERE u.id = ?
  GROUP BY u.id, u.email, u.first_name, u.last_name, u.is_active, pat.id, doc.id
`;

/** Charge l'utilisateur authentifié (rôles et permissions effectifs inclus). */
export async function loadAuthUserById(userId: number): Promise<AuthUser | null> {
  const row = await queryOne<IdentityRow>(IDENTITY_SQL, [userId]);
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    roles: splitList(row.roles),
    permissions: splitList(row.permissions),
    patientId: row.patient_id ?? null,
    doctorId: row.doctor_id ?? null,
  };
}

function splitList(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').filter((item) => item.length > 0);
}

/** Extrait le jeton d'accès de la requête (en-tête ou `?token=` sur GET). */
function extractToken(req: Request): string | null {
  const header = req.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }

  if (req.method === 'GET') {
    const fromQuery = req.query.token;
    if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;
  }

  return null;
}

/**
 * Exige un utilisateur authentifié et actif.
 * Renseigne `req.user` et `req.accessToken`.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      throw AppError.unauthorized('Jeton d’authentification manquant.', 'TOKEN_MISSING');
    }

    const decoded = verifyAccessToken(token);
    const user = await loadAuthUserById(decoded.sub);

    if (!user) {
      throw AppError.unauthorized('Compte introuvable.', 'USER_NOT_FOUND');
    }

    const identity = await queryOne<Row & { is_active: number }>(
      'SELECT is_active FROM users WHERE id = ?',
      [decoded.sub],
    );
    if (!identity || identity.is_active === 0) {
      throw AppError.forbidden('Votre compte a été désactivé.', 'ACCOUNT_DISABLED');
    }

    req.user = user;
    req.accessToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Renseigne `req.user` si un jeton valide est présent, sans jamais échouer.
 * Utilisé par les routes publiques qui s'enrichissent pour les connectés
 * (par exemple la page d'accueil ou la prise de rendez-vous).
 */
export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractToken(req);
    if (token) {
      const decoded = verifyAccessToken(token);
      const user = await loadAuthUserById(decoded.sub);
      if (user) {
        req.user = user;
        req.accessToken = token;
      }
    }
  } catch {
    // Jeton absent, expiré ou invalide : la requête reste anonyme.
  }
  next();
}
