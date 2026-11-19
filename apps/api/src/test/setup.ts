/**
 * Amorçage des tests de l'API.
 *
 * Les variables d'environnement sont posées AVANT tout import de `config/env.ts`,
 * sinon la validation Zod s'exécuterait sur les valeurs de développement.
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '4100';
process.env.DB_NAME = process.env.DB_NAME ?? 'mediclinic_test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-0123456789abcdef0123456789abcdef';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-0123456789abcdef0123456789abcdef';
process.env.RATE_LIMIT_MAX = '10000';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
