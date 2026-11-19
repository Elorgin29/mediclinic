# Captures d'écran — MediClinic

Ce dossier contient les visuels illustrant l'interface de l'application.

---

## Index des visuels

| Fichier | Écran | Éléments présentés |
| --- | --- | --- |
| `01-accueil.png` | Page d'accueil publique | Bannière, 4 chiffres clés, carte horaires, 4 services, spécialités |
| `02-connexion.png` | Connexion | Formulaire, bascule d'affichage du mot de passe, comptes de démonstration |
| `03-prise-rdv.png` | Prise de rendez-vous | Fil des 3 étapes, sélection du créneau, récapitulatif et tarif |
| `04-dashboard-admin.png` | Tableau de bord | 6 indicateurs, courbe de CA sur 12 mois, rendez-vous par département, alertes de stock |
| `05-patients.png` | Liste des patients | Recherche, filtre par genre, tableau avec avatars, groupes sanguins, allergies, pagination |
| `06-roles-permissions.png` | Rôles & permissions | Liste des 8 rôles avec cadenas, matrice 15 ressources × 5 actions |
| `07-facture-pdf.png` | Facture PDF | En-tête clinique, informations, lignes, totaux HT/TVA/TTC, pied de page numéroté |
| `08-espace-patient.png` | Espace patient | 4 compteurs, prochain rendez-vous, ordonnances récentes, factures |
| `09-planning-gardes.png` | Planning des gardes | Calendrier mensuel, gardes colorées par médecin, navigation |
| `10-journal-audit.png` | Journal d'audit | 3 compteurs, 5 filtres, 12 entrées avec IP et badges d'action |

---

## Comment ces images ont été produites

**Important — transparence sur la méthode.**

Ces visuels ont été générés par composition graphique avec **Pillow** (script
`database/scripts/generate-screenshots.py`), et **non** par capture d'écran d'un
navigateur. La raison est matérielle : l'environnement de développement de ce
dépôt ne dispose ni de Chrome/Chromium headless, ni d'un serveur MySQL permettant
de faire tourner l'application complète pour la photographier.

Pour garantir leur fidélité, le script reprend **exactement** :

- la palette de couleurs de `apps/web/tailwind.config.js` (`brand-700` = `#0f766e`,
  `slate-50` à `slate-900`, tons `emerald`, `amber`, `rose`, `sky`) ;
- les classes utilitaires de `apps/web/src/index.css` (cartes `card`, en-tête
  `card-header`, tableaux `table`, boutons `btn-primary`) ;
- les libellés français réellement affichés dans les composants React ;
- les données de démonstration de `database/migrations/003_seed.sql` (Lucie
  Durand, Dr Amine Haddad, `FAC-2026-000123`, Oméprazole 20 mg, etc.) ;
- la structure de l'écran telle qu'implémentée (barre latérale de 288 px,
  en-tête de 64 px, grille d'indicateurs, etc.).

Ces images sont donc des **représentations fidèles** de l'interface, mais pas des
photographies. Elles ne remplacent pas une démonstration en direct.

---

## Capturer les écrans depuis une instance réelle

Pour obtenir de vraies captures (recommandé avant un dépôt final), suivez cette
procédure.

### 1. Démarrer l'application

```bash
npm install
npm run db:reset     # base + jeu de démonstration
npm run dev          # API (4000) + front (5173)
```

Vérifier : http://localhost:4000/api/health → `"status": "ok"`.

### 2. Se connecter avec les comptes de démonstration

Mot de passe commun : **`Passw0rd!2026`**

| Rôle | Email |
| --- | --- |
| Super administrateur | `superadmin@mediclinic.fr` |
| Pharmacien | `paul.mercier@mediclinic.fr` |
| Comptable | `hugo.charpentier@mediclinic.fr` |
| Patient | `lucie.durand@email.fr` |

### 3. Capture manuelle

**Windows** : `Win + Maj + S` (Capture d'écran et croquis)
**macOS** : `Cmd + Maj + 4`
**Linux** : `gnome-screenshot -a` ou `spectacle`

Régler la fenêtre du navigateur sur **1440 × 900** pour un rendu homogène.

### 4. Capture automatisée (optionnel)

Si **Chrome** est installé, Puppeteer permet de scripter les captures :

```bash
npm install --no-save puppeteer
```

```js
// scripts/capture.mjs
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// Page d'accueil
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
await page.screenshot({ path: 'docs/SCREENSHOTS/01-accueil.png' });

// Connexion
await page.goto('http://localhost:5173/connexion', { waitUntil: 'networkidle2' });
await page.screenshot({ path: 'docs/SCREENSHOTS/02-connexion.png' });

// Connexion puis tableau de bord
await page.type('input[type="email"]', 'superadmin@mediclinic.fr');
await page.type('input[type="password"]', 'Passw0rd!2026');
await page.click('button[type="submit"]');
await page.waitForNavigation({ waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1500));  // laisser les graphiques se dessiner
await page.screenshot({ path: 'docs/SCREENSHOTS/04-dashboard-admin.png' });

await browser.close();
```

> Attendre `networkidle2` **et** un délai supplémentaire sur le tableau de bord :
> les graphiques Recharts s'animent après le chargement des données.

### 5. Points de vigilance

- **Mode sombre** : désactiver l'extension éventuelle pour un rendu cohérent.
- **Données** : lancer `npm run db:reset` avant, pour des chiffres stables.
- **Notifications** : la cloche affiche un compteur ; fermer les toasts avant la capture.
- **Zoom du navigateur** : rester à 100 %.

---

## Régénérer les visuels actuels

```bash
python database/scripts/generate-screenshots.py
```

Le script écrit dans ce dossier et affiche la taille de chaque fichier. Il ne
nécessite aucune dépendance hors **Pillow**.

---

## Utilisation dans la documentation

Les visuels sont référencés dans :

- [`README.md`](../../README.md) — section « Captures d'écran » ;
- [`docs/DEMO.md`](../DEMO.md) — checklist de soutenance.

Pour insérer une image dans un document Markdown du dépôt :

```markdown
![Tableau de bord](docs/SCREENSHOTS/04-dashboard-admin.png)
```

---

## Licence

Ces visuels font partie du projet MediClinic. Les données qu'ils contiennent sont
entièrement fictives.
