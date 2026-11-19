# Dossier `public` — fichiers statiques de l'API

Ce dossier est servi par Express sous le préfixe **`/static`** (voir `src/app.ts`) :

```
/static/uploads/<fichier>   → fichiers téléversés (avatars, pièces jointes)
/static/<fichier>           → ressources fixes de l'application
```

## Logo de la clinique

Placez ici un fichier **`logo.png`** (512 × 512 px recommandé, fond transparent) pour
qu'il apparaisse dans l'en-tête de tous les documents PDF générés (dossiers
patients, ordonnances, factures, bons de dispensation, plannings de gardes).

Le générateur PDF (`src/utils/pdf.generator.ts`) cherche, dans l'ordre :

1. `public/logo.png`
2. `public/logo.jpg`

Si aucun fichier n'est trouvé, ou si l'image est illisible, un **monogramme « MC »**
sur fond vert médical est dessiné à la place. La génération de documents ne dépend
donc jamais de la présence d'un logo.

## Ajouter un logo

```bash
# Depuis la racine du monorepo
cp mon-logo.png apps/api/src/public/logo.png
```

Redémarrez ensuite l'API : le logo est lu à chaque génération.

## Autres fichiers statiques

| Fichier | Usage |
| --- | --- |
| `logo.png` | En-tête des PDF |
| `mentions-legales.pdf` | Document joint aux emails d'inscription (optionnel) |

## Sécurité

- Ne déposez **jamais** de donnée personnelle dans ce dossier : tout ce qu'il
  contient est accessible sans authentification.
- Les fichiers réellement téléversés par les utilisateurs vont dans
  `apps/api/uploads`, qui bénéficie d'une validation du type MIME et d'une
  limite de taille (`UPLOAD_MAX_SIZE_MB`).
