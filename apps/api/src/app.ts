/**
 * Construction de l'application Express.
 *
 * Séparer `app.ts` de `server.ts` permet de tester l'API (Supertest) sans
 * ouvrir de port d'écoute.
 *
 * Ordre des couches (important) :
 *   sécurité → analyse du corps → journalisation → fichiers statiques →
 *   limiteurs de débit → routes métier → 404 → gestionnaire d'erreurs.
 */

import { API_PUBLIC_PREFIX } from '@mediclinic/shared';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { uploadErrorHandler } from './middlewares/upload.middleware.js';
import { apiRouter } from './routes/index.js';

/** Limiteur global : protège l'ensemble de l'API contre les abus. */
const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Trop de requêtes. Veuillez patienter quelques minutes.' },
  },
});

/** Limiteur renforcé sur les routes d'authentification (anti-force brute). */
const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
    },
  },
});

/** Crée l'application Express configurée. */
export function createApp(): Express {
  const app = express();

  /* ------------------------------------------------------------------ */
  /* Sécurité                                                            */
  /* ------------------------------------------------------------------ */
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Les PDF et les images servis par l'API sont consommés par l'application
      // web servie sur un autre port : la politique stricte par défaut les
      // bloquerait.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Requêtes sans en-tête Origin (curl, Postman, tests) : autorisées.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origine non autorisée par CORS : ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['Content-Disposition'],
    }),
  );

  /* ------------------------------------------------------------------ */
  /* Analyse de la requête                                               */
  /* ------------------------------------------------------------------ */
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  /* ------------------------------------------------------------------ */
  /* Journalisation                                                      */
  /* ------------------------------------------------------------------ */
  if (!env.isTest) {
    app.use(morgan(env.LOG_LEVEL));
  }

  /* ------------------------------------------------------------------ */
  /* Fichiers statiques (logo des PDF, pièces téléversées)                */
  /* ------------------------------------------------------------------ */
  app.use(`${API_PUBLIC_PREFIX}/uploads`, express.static(env.paths.uploads, { maxAge: '1d' }));
  app.use(API_PUBLIC_PREFIX, express.static(env.paths.static, { maxAge: '1h' }));

  /* ------------------------------------------------------------------ */
  /* Limiteurs de débit                                                  */
  /* ------------------------------------------------------------------ */
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api', globalLimiter);

  /* ------------------------------------------------------------------ */
  /* Routes métier                                                       */
  /* ------------------------------------------------------------------ */
  app.use('/api', apiRouter);

  /* ------------------------------------------------------------------ */
  /* Erreurs                                                             */
  /* ------------------------------------------------------------------ */
  app.use(uploadErrorHandler);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
