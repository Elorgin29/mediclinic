/**
 * Contrôleurs HTTP du module d'authentification.
 * Aucune règle métier ici : uniquement l'extraction des données de la requête,
 * l'appel au service et la mise en forme de la réponse.
 */

import { changePasswordSchema, loginSchema, registerPatientSchema } from '@mediclinic/shared';
import type { RequestHandler } from 'express';

import { REFRESH_COOKIE_NAME, refreshCookieOptions } from '../../config/jwt.js';
import { asyncHandler } from '../../utils/http.js';
import { requestContext } from '../../utils/audit-logger.js';
import { AppError } from '../../utils/app-error.js';
import * as authService from './auth.service.js';

/** Extrait le jeton de rafraîchissement (corps de requête ou cookie httpOnly). */
function readRefreshToken(body: unknown, cookies: unknown): string | undefined {
  const fromBody =
    typeof body === 'object' && body !== null && 'refreshToken' in body
      ? (body as { refreshToken?: unknown }).refreshToken
      : undefined;

  if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;

  const fromCookie =
    typeof cookies === 'object' && cookies !== null
      ? (cookies as Record<string, unknown>)[REFRESH_COOKIE_NAME]
      : undefined;

  return typeof fromCookie === 'string' && fromCookie.length > 0 ? fromCookie : undefined;
}

/**
 * POST /api/auth/login
 * Authentifie un utilisateur et renvoie sa session.
 */
export const login: RequestHandler = asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const context = requestContext(req);
  const session = await authService.login(input, context);

  res.cookie(REFRESH_COOKIE_NAME, session.tokens.refreshToken, refreshCookieOptions());
  res.json({ data: session });
});

/**
 * POST /api/auth/register
 * Inscription en ligne d'un patient (compte + dossier médical).
 */
export const register: RequestHandler = asyncHandler(async (req, res) => {
  const input = registerPatientSchema.parse(req.body);
  const context = requestContext(req);
  const session = await authService.registerPatient(input, context);

  res.cookie(REFRESH_COOKIE_NAME, session.tokens.refreshToken, refreshCookieOptions());
  res.status(201).json({ data: session });
});

/**
 * POST /api/auth/refresh
 * Renouvelle la session à partir du jeton de rafraîchissement (rotation).
 */
export const refresh: RequestHandler = asyncHandler(async (req, res) => {
  const token = readRefreshToken(req.body, req.cookies);
  if (!token) {
    throw AppError.unauthorized('Jeton de rafraîchissement manquant.', 'REFRESH_TOKEN_MISSING');
  }

  const session = await authService.refresh(token, requestContext(req));
  res.cookie(REFRESH_COOKIE_NAME, session.tokens.refreshToken, refreshCookieOptions());
  res.json({ data: session });
});

/**
 * POST /api/auth/logout
 * Révoque le jeton de rafraîchissement et supprime le cookie.
 */
export const logout: RequestHandler = asyncHandler(async (req, res) => {
  const token = readRefreshToken(req.body, req.cookies);
  await authService.logout(token, req.user?.id ?? null, requestContext(req));

  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
  res.status(204).send();
});

/**
 * GET /api/auth/me
 * Profil complet de l'utilisateur connecté (rôles et permissions effectifs).
 */
export const me: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  const user = await authService.getProfile(req.user.id);
  res.json({ data: user });
});

/**
 * POST /api/auth/change-password
 * Change le mot de passe et révoque toutes les sessions de l'utilisateur.
 */
export const changePassword: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');

  const input = changePasswordSchema.parse(req.body);
  await authService.changePassword(
    req.user.id,
    input.currentPassword,
    input.newPassword,
    requestContext(req),
  );

  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
  res.json({ data: { message: 'Mot de passe modifié. Veuillez vous reconnecter.' } });
});
