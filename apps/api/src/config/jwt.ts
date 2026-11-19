/**
 * Gestion des jetons JWT.
 *
 * Stratégie retenue :
 *  - **Jeton d'accès** : JWT signé HS256, courte durée (15 min), envoyé dans
 *    l'en-tête `Authorization: Bearer …`. Il porte l'identité et les rôles.
 *  - **Jeton de rafraîchissement** : chaîne aléatoire opaque de 64 octets,
 *    stockée HACHÉE (SHA-256) dans la table `refresh_tokens` et transmise dans
 *    un cookie `httpOnly`. Il est à usage unique : chaque rafraîchissement
 *    révoque l'ancien jeton et en émet un nouveau (rotation).
 */

import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';

import { AppError } from '../utils/app-error.js';
import { env } from './env.js';

const ISSUER = 'mediclinic-api';
const AUDIENCE = 'mediclinic-app';

export interface AccessTokenPayload {
  /** Identifiant de l'utilisateur. */
  sub: number;
  email: string;
  roles: string[];
  /** Permissions effectives, pour éviter un aller-retour base à chaque requête. */
  permissions: string[];
}

export interface DecodedAccessToken extends AccessTokenPayload {
  iat: number;
  exp: number;
}

/** Convertit une durée de type `15m`, `7d`, `3600` en millisecondes. */
export function parseDurationToMs(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d|w)?$/i.exec(value.trim());
  if (!match?.[1]) return 0;

  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] ?? 'ms').toLowerCase();

  const factors: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };

  return amount * (factors[unit] ?? 1);
}

/** Signe un jeton d'accès pour l'utilisateur fourni. */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(
    {
      email: payload.email,
      roles: payload.roles,
      permissions: payload.permissions,
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: String(payload.sub),
      expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: AUDIENCE,
    },
  );
}

/** Vérifie un jeton d'accès et renvoie sa charge utile. Lève une AppError 401 sinon. */
export function verifyAccessToken(token: string): DecodedAccessToken {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (typeof decoded === 'string' || decoded.sub === undefined) {
      throw new Error('Charge utile inattendue');
    }

    return {
      sub: Number.parseInt(decoded.sub, 10),
      email: typeof decoded.email === 'string' ? decoded.email : '',
      roles: Array.isArray(decoded.roles) ? (decoded.roles as string[]) : [],
      permissions: Array.isArray(decoded.permissions) ? (decoded.permissions as string[]) : [],
      iat: decoded.iat ?? 0,
      exp: decoded.exp ?? 0,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Votre session a expiré, veuillez vous reconnecter.', 'TOKEN_EXPIRED');
    }
    throw AppError.unauthorized('Jeton d’authentification invalide.', 'TOKEN_INVALID');
  }
}

/** Génère un jeton de rafraîchissement opaque ainsi que son empreinte SHA-256. */
export function generateRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(64).toString('hex');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + parseDurationToMs(env.REFRESH_TOKEN_TTL)),
  };
}

/** Empreinte SHA-256 d'un jeton (le jeton en clair n'est jamais stocké). */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Options du cookie portant le jeton de rafraîchissement. */
export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: parseDurationToMs(env.REFRESH_TOKEN_TTL),
  };
}

export const REFRESH_COOKIE_NAME = 'mediclinic_refresh_token';

/** Nombre de millisecondes avant expiration d'un jeton d'accès (réponse /login). */
export const accessTokenTtlMs = parseDurationToMs(env.ACCESS_TOKEN_TTL);
