/**
 * Chargement et validation des variables d'environnement.
 *
 * Le fichier `.env` est cherché d'abord à la racine du monorepo, puis dans
 * `apps/api` (utile pour les tests et les déploiements isolés). Toutes les
 * variables sont validées par Zod : l'application refuse de démarrer si une
 * variable obligatoire est absente ou mal formée, ce qui évite les erreurs
 * découvertes tardivement en production.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
/** apps/api (le build produit dist/config, on remonte donc de deux niveaux). */
const apiRoot = path.resolve(currentDir, '..', '..');
/** Racine du monorepo : c'est là que vit le .env.example. */
const repoRoot = path.resolve(apiRoot, '..', '..');

for (const candidate of [path.join(repoRoot, '.env'), path.join(apiRoot, '.env')]) {
  dotenv.config({ path: candidate });
}

/** Convertit une chaîne d'environnement en booléen (« true »/« 1 » uniquement). */
const booleanFromEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return defaultValue;
      return ['true', '1', 'yes', 'oui'].includes(value.toLowerCase());
    });

const envSchema = z.object({
  /* ------------------------------------------------------------------ */
  /* Application                                                        */
  /* ------------------------------------------------------------------ */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),

  /* ------------------------------------------------------------------ */
  /* Base de données                                                    */
  /* ------------------------------------------------------------------ */
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65_535).default(3306),
  DB_USER: z.string().min(1).default('mediclinic'),
  DB_PASSWORD: z.string().default('mediclinic'),
  DB_NAME: z.string().min(1).default('mediclinic'),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(200).default(10),
  DB_SSL: booleanFromEnv(false),

  /* ------------------------------------------------------------------ */
  /* Authentification                                                   */
  /* ------------------------------------------------------------------ */
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET doit contenir au moins 32 caractères')
    .default('dev-access-secret-please-change-me-0123456789abcdef'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET doit contenir au moins 32 caractères')
    .default('dev-refresh-secret-please-change-me-0123456789abcdef'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: booleanFromEnv(false),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  /* ------------------------------------------------------------------ */
  /* Sécurité / limites                                                 */
  /* ------------------------------------------------------------------ */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  UPLOAD_MAX_SIZE_MB: z.coerce.number().int().min(1).max(50).default(5),

  /* ------------------------------------------------------------------ */
  /* Messagerie                                                         */
  /* ------------------------------------------------------------------ */
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  MAIL_FROM: z.string().default('MediClinic <no-reply@mediclinic.fr>'),

  /* ------------------------------------------------------------------ */
  /* Identité de la clinique (en-têtes et pieds de page des PDF)         */
  /* ------------------------------------------------------------------ */
  CLINIC_NAME: z.string().default('Clinique MediClinic'),
  CLINIC_ADDRESS: z.string().default('12 avenue de la Santé, 75015 Paris, France'),
  CLINIC_PHONE: z.string().default('+33 1 45 67 89 00'),
  CLINIC_EMAIL: z.string().default('contact@mediclinic.fr'),
  CLINIC_CURRENCY: z.string().length(3).default('EUR'),
  CLINIC_VAT_RATE: z.coerce.number().min(0).max(100).default(20),

  /* ------------------------------------------------------------------ */
  /* Zoom (Server-to-Server OAuth + Meeting SDK)                         */
  /* Credentials vides ⇒ mode dégradé : les téléconsultations restent      */
  /* simulées et l'application fonctionne hors ligne.                     */
  /* ------------------------------------------------------------------ */
  ZOOM_ACCOUNT_ID: z.string().default(''),
  ZOOM_CLIENT_ID: z.string().default(''),
  ZOOM_CLIENT_SECRET: z.string().default(''),
  ZOOM_USER_ID: z.string().default('me'),
  ZOOM_SDK_KEY: z.string().default(''),
  ZOOM_SDK_SECRET: z.string().default(''),

  /* ------------------------------------------------------------------ */
  /* Divers                                                             */
  /* ------------------------------------------------------------------ */
  SEED_DEFAULT_PASSWORD: z.string().default('Passw0rd!2026'),
  LOG_LEVEL: z.enum(['tiny', 'short', 'common', 'combined', 'dev']).default('dev'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`Configuration invalide :\n${details}\nVérifiez votre fichier .env (modèle : .env.example).`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  isDevelopment: raw.NODE_ENV === 'development',
  /** Origines autorisées par CORS, découpées et nettoyées. */
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  /** Taille maximale d'un envoi de fichier, en octets. */
  uploadMaxSizeBytes: raw.UPLOAD_MAX_SIZE_MB * 1024 * 1024,
  /** true lorsque les identifiants Zoom sont renseignés. */
  zoomEnabled:
    raw.ZOOM_ACCOUNT_ID !== '' && raw.ZOOM_CLIENT_ID !== '' && raw.ZOOM_CLIENT_SECRET !== '',
  paths: {
    apiRoot,
    repoRoot,
    uploads: path.join(apiRoot, 'uploads'),
    static: path.join(apiRoot, 'public'),
  },
} as const;

export type Env = typeof env;
