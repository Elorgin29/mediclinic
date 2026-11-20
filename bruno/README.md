# MediClinic API — collection Bruno

- `152` requêtes, `25` dossiers, `1` environnement (`Local`).
- Chaque dossier possède un `folder.bru` documenté.
- Chaque requête possède un bloc `docs { ... }` avec méthode, URL, description, auth et réponse attendue.
- Voir [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) pour le détail de toutes les variables.

## Démarrage rapide

1. `npm run dev:api`
2. `npm run db:reset -- --yes`
3. Sélectionner l’environnement **Local**.
4. Exécuter **Auth / Login**, puis les autres requêtes.

Le token d’accès est automatiquement mémorisé dans `{{accessToken}}`.
