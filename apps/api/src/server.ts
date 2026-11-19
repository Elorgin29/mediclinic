/**
 * Point d'entrée du serveur API.
 *
 * Démarrage :
 *   1. vérification de la connexion MySQL (avertissement non bloquant) ;
 *   2. écoute HTTP ;
 *   3. arrêt propre sur SIGINT / SIGTERM.
 */

import { createApp } from './app.js';
import { closePool, testConnection } from './config/db.js';
import { env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const database = await testConnection();
  if (database.ok) {
    // eslint-disable-next-line no-console
    console.log(`[api] MySQL connecté (version ${database.version}).`);
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      `[api] MySQL injoignable : ${database.error}\n` +
        '[api] Vérifiez DB_HOST / DB_PORT / DB_USER / DB_PASSWORD dans .env, ' +
        'puis lancez « npm run db:create ».',
    );
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[api] MediClinic écoute sur ${env.API_URL} (environnement : ${env.NODE_ENV}).\n` +
        `[api] Documentation des routes : docs/API.md`,
    );
  });

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[api] Signal ${signal} reçu : arrêt en cours…`);
    server.close(() => {
      void closePool().finally(() => {
        // eslint-disable-next-line no-console
        console.log('[api] Arrêt terminé.');
        process.exit(0);
      });
    });

    // Filet de sécurité si des connexions restent ouvertes.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[api] Démarrage impossible :', error);
  process.exit(1);
});
