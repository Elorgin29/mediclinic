import { defineConfig } from 'vitest/config';

/**
 * Configuration Vitest du paquet partagé.
 *
 * Les schémas et formateurs sont testés ici : ce sont les contrats communs au
 * front et au back, ils doivent donc être verrouillés indépendamment.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
