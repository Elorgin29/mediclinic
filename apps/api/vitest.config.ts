/**
 * Configuration Vitest côté API.
 *
 * Les tests d'intégration (Supertest) ont besoin de `NODE_ENV=test` pour
 * désactiver la journalisation HTTP et alléger les réponses d'erreur.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 20_000,
    // Les tests touchent une base réelle : une exécution séquentielle évite les
    // interférences entre transactions.
    sequence: { concurrent: false },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
