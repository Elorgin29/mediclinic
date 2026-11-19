/**
 * Configuration Vitest du front.
 *
 * Un fichier dédié est nécessaire : le bloc `test` de `vite.config.ts` n'est
 * pas typé et Vitest ne l'applique pas de façon fiable lorsqu'il est mêlé à la
 * configuration de build.
 */

import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    // Les tests d'interface sont plus lents que des tests unitaires purs.
    testTimeout: 15_000,
  },
});
