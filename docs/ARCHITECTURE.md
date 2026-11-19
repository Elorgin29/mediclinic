# Architecture de MediClinic

Document de référence sur les décisions techniques, la structure du code et les
mécanismes transverses.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Organisation du monorepo](#2-organisation-du-monorepo)
3. [Architecture du back-end](#3-architecture-du-back-end)
4. [Architecture du front-end](#4-architecture-du-front-end)
5. [Stratégie de sécurité](#5-stratégie-de-sécurité)
6. [Contrôle d'accès (RBAC)](#6-contrôle-daccès-rbac)
7. [Persistance et intégrité](#7-persistance-et-intégrité)
8. [Intégration Zoom](#8-intégration-zoom)
9. [Génération des documents PDF](#9-génération-des-documents-pdf)
10. [Journalisation et audit](#10-journalisation-et-audit)
11. [Gestion des erreurs](#11-gestion-des-erreurs)
12. [Décisions d'architecture](#12-décisions-darchitecture)
13. [Diagrammes de séquence](#13-diagrammes-de-séquence)
14. [Performances](#14-performances)
15. [Limites connues et évolutions](#15-limites-connues-et-évolutions)

---

## 1. Vue d'ensemble

MediClinic est une application web **monorepo** à trois workspaces, couvrant
l'intégralité du parcours de soin d'une clinique pluridisciplinaire.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          NAVIGATEUR                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │
│  │  Site public   │  │ Espace patient │  │   Back-office staff    │  │
│  └────────────────┘  └────────────────┘  └────────────────────────┘  │
│              React 18 · TypeScript · Vite · Tailwind                 │
│              TanStack Query · React Router v6 · Recharts            │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ HTTPS · JSON · JWT Bearer
┌───────────────────────────▼──────────────────────────────────────────┐
│                      API EXPRESS + TYPESCRIPT                        │
│   Route → Controller → Service → Repository → SQL préparé            │
│   Middlewares : auth · rbac · validate (Zod) · audit · error         │
└──────┬──────────────────────────────────────────────┬────────────────┘
       │                                              │
┌──────▼──────────────┐                    ┌──────────▼─────────────┐
│   MySQL 8 (InnoDB)  │                    │   Services externes    │
│   26 tables         │                    │   Zoom REST / SDK      │
│   14 vues           │                    │   SMTP (MailHog)       │
│   10 triggers       │                    │   pdfkit (local)       │
└─────────────────────┘                    └────────────────────────┘
```

### Chiffres clés

| Indicateur | Valeur |
| --- | --- |
| Modules API | 24 |
| Routes HTTP | 150 |
| Tables SQL | 26 |
| Vues SQL | 14 |
| Triggers SQL | 10 |
| Permissions RBAC | 77 |
| Rôles | 8 |
| Pages React | 31 |
| Documents PDF | 6 modèles |
| Tests automatisés | 68 |

---

## 2. Organisation du monorepo

### Workspaces npm

```json
{
  "workspaces": ["packages/*", "apps/*"]
}
```

| Workspace | Nom npm | Rôle |
| --- | --- | --- |
| `packages/shared` | `@mediclinic/shared` | Types, schémas Zod, constantes, permissions |
| `apps/api` | `@mediclinic/api` | Serveur Express |
| `apps/web` | `@mediclinic/web` | Application React |

### Le paquet partagé

`@mediclinic/shared` est consommé **directement en source TypeScript** :

```json
{
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

Aucune étape de build n'est nécessaire en développement : Vite et `tsx`
compilent à la volée. C'est un gain de vélocité significatif, au prix d'un
`tsc` complet lors du build de production.

**Contenu :**

| Fichier | Contenu |
| --- | --- |
| `constants.ts` | Énumérations (statuts, types, rôles), libellés français, seuils |
| `types.ts` | 40+ interfaces de domaine partagées |
| `schemas.ts` | 64 schémas Zod de validation |
| `permissions.ts` | Matrice RBAC, helpers `hasPermission` / `hasAnyPermission` |
| `formatters.ts` | Formatage `fr-FR` (dates, montants, pourcentages, âge) |
| `index.ts` | Barrel d'export |

**Bénéfice principal** : une règle de validation est définie **une seule fois** et
appliquée à l'identique côté formulaire et côté API. Aucune divergence possible
entre le contrôle de saisie du navigateur et celui du serveur.

---

## 3. Architecture du back-end

### Séparation en quatre couches

```
┌─────────────────────────────────────────────────────────────┐
│ ROUTE          xxx.routes.ts                                │
│   Déclare le chemin et la chaîne de middlewares             │
│   ✗ SQL   ✗ règle métier                                    │
├─────────────────────────────────────────────────────────────┤
│ CONTROLLER     xxx.controller.ts                            │
│   Lit req, valide (Zod), appelle le service, formate res    │
│   ✗ SQL   ✗ règle métier                                    │
├─────────────────────────────────────────────────────────────┤
│ SERVICE        xxx.service.ts                               │
│   Règles métier, vérifications, transactions                │
│   ✗ SQL                                                     │
├─────────────────────────────────────────────────────────────┤
│ REPOSITORY     xxx.repository.ts                            │
│   Requêtes SQL préparées, mapping des lignes                │
│   ✗ règle métier                                            │
└─────────────────────────────────────────────────────────────┘
```

Cette contrainte est **vérifiée** : `apps/api/CONVENTIONS.md` est normatif et
chaque module a été relu contre lui.

### Arborescence

```
apps/api/src/
├── config/
│   ├── env.ts          # validation Zod de l'environnement, refus de démarrer si invalide
│   ├── db.ts           # pool mysql2, query/queryOne/execute/insert, withTransaction
│   ├── jwt.ts          # signature/vérification, jetons opaques, cookies
│   └── zoom.ts         # OAuth S2S + Meeting SDK + mode dégradé
├── middlewares/
│   ├── auth.middleware.ts    # authenticate, optionalAuthenticate, loadAuthUserById
│   ├── rbac.middleware.ts    # requirePermission, requireAnyPermission, requireRole
│   ├── validate.middleware.ts # validation Zod body/query/params
│   ├── audit.middleware.ts   # auditTrail, setAuditPayload
│   ├── error.middleware.ts   # errorHandler, notFoundHandler, mapping MySQL
│   └── upload.middleware.ts  # multer, contrôle MIME, noms aléatoires
├── modules/            # 24 modules, chacun avec 3 à 4 fichiers
├── routes/index.ts     # agrégation de tous les routeurs
├── utils/
│   ├── app-error.ts    # AppError + fabriques (badRequest, notFound, conflict…)
│   ├── http.ts         # asyncHandler, parseIdParam, buildSetClause, compact
│   ├── pagination.ts   # parsePagination, paginated, buildOrderBy (liste blanche)
│   ├── datetime.ts     # conversion MySQL ↔ ISO, fuseaux, plages par défaut
│   ├── audit-logger.ts # writeAuditLog, requestContext
│   ├── email.service.ts# nodemailer + gabarits HTML
│   └── pdf.generator.ts# 6 générateurs pdfkit
├── app.ts              # construction de l'app Express
└── server.ts           # bootstrap, arrêt propre
```

### Modules métier

| Module | Fichiers | Rôle |
| --- | --- | --- |
| `auth` | 4 | Connexion, inscription, rafraîchissement, mot de passe |
| `users` | 4 | Comptes utilisateurs |
| `roles` | 4 | Rôles et matrice |
| `permissions` | 4 | Référentiel des permissions |
| `specialties` | 4 | Spécialités médicales |
| `departments` | 4 | Départements |
| `doctors` | 4 | Profils médecins, annuaire public, disponibilités |
| `patients` | 4 | Dossiers, historique, portail |
| `appointments` | 4 | Rendez-vous, agenda, réservation publique |
| `consultations` | 4 | Comptes-rendus |
| `prescriptions` | 4 | Ordonnances, dispensation |
| `medications` | 4 | Catalogue pharmacie |
| `stock` | 4 | Mouvements et alertes |
| `invoices` | 4 | Facturation |
| `payments` | 4 | Encaissements |
| `shifts` | 4 | Planning des gardes |
| `meetings` | 4 | Téléconsultations |
| `lab` | 4 | Analyses de laboratoire |
| `notifications` | 4 | Notifications internes |
| `settings` | 4 | Paramètres de la clinique |
| `dashboard` | 4 | Indicateurs et graphiques |
| `reports` | 4 | Rapports et export CSV |
| `audit` | 4 | Journal d'audit |
| `pdf` | 4 | Génération documentaire |

### Ordre des middlewares dans `app.ts`

L'ordre est **critique** :

```ts
helmet()                    // 1. en-têtes de sécurité
cors()                      // 2. origines autorisées
express.json()              // 3. analyse du corps
cookieParser()              // 4. lecture des cookies
morgan()                    // 5. journalisation HTTP
express.static()            // 6. fichiers statiques (/static)
rateLimit()                 // 7. limitation de débit
apiRouter                   // 8. routes métier
uploadErrorHandler          // 9. erreurs Multer
notFoundHandler             // 10. 404
errorHandler                // 11. erreurs (doit être dernier)
```

`errorHandler` doit impérativement être déclaré en dernier : Express reconnaît
un gestionnaire d'erreurs à sa signature à quatre arguments, et il ne capte que
les erreurs produites par les couches **précédentes**.

---

## 4. Architecture du front-end

### Arborescence

```
apps/web/src/
├── components/
│   ├── ui/              # Button, Field, Card, Badge, DataTable, Modal, Feedback
│   ├── layouts/         # PublicLayout, AdminLayout, PatientLayout, PageHeader
│   ├── Can.tsx          # contrôle d'affichage par permission
│   └── MeetingRoom.tsx  # Zoom SDK + repli simulé
├── contexts/
│   └── AuthContext.tsx  # session, rôles, permissions, login/logout
├── hooks/
│   └── index.ts         # useListQuery, useTheme, useDebounce
├── lib/
│   ├── apiClient.ts     # axios + rafraîchissement transparent du jeton
│   ├── queryClient.ts   # TanStack Query + clés de cache
│   ├── pdf.ts           # téléchargement/ouverture des PDF
│   ├── utils.ts         # cn, formatNumber, statusTone, doctorColor
│   └── clinic.ts        # coordonnées de la clinique
├── pages/
│   ├── public/          # Home, Doctors, Specialties, Booking, Teleconsultation
│   ├── auth/            # Login, Register
│   ├── admin/           # 22 pages du back-office
│   ├── patient/         # 7 pages de l'espace patient
│   └── errors/          # Forbidden (403), NotFound (404)
├── routes/
│   ├── AppRoutes.tsx    # table de routage + lazy loading
│   ├── ProtectedRoute.tsx # gardes d'accès
│   └── navigation.ts    # configuration des menus (avec permissions)
├── test/setup.ts
├── index.css            # Tailwind + composants @apply
└── main.tsx             # point d'entrée, fournisseurs
```

### Découpage des bundles

Toutes les pages du back-office et de l'espace patient sont chargées via
`React.lazy` :

```tsx
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'));
```

Résultat du build de production :

| Chunk | Taille | Contenu |
| --- | --- | --- |
| `index.js` | 332 kB | Shell, auth, site public |
| `charts.js` | 436 kB | Recharts (chargé uniquement sur les écrans à graphiques) |
| `react.js` | 157 kB | React, React DOM, React Router |
| `query.js` | 49 kB | TanStack Query |
| Pages | 4–12 kB chacune | Chargées à la demande |

Le site public est donc affiché sans télécharger le back-office ni Recharts.

### État et synchronisation des données

**Trois niveaux distincts :**

1. **Session** (`AuthContext`) : utilisateur, rôles, permissions. Rechargé au
   démarrage via `GET /auth/me`.
2. **Données serveur** (TanStack Query) : cache, invalidation, états de chargement.
   `staleTime` de 30 s, pas de nouvelle tentative sur les erreurs 4xx.
3. **État d'URL** (`useListQuery`) : filtres, pagination, tri. Un écran filtré est
   partageable et survit à un rechargement.

**`useListQuery`** mérite une mention : il synchronise l'état d'une liste avec la
query string, ce qui donne gratuitement le partage de lien, le bouton « retour »
du navigateur et la restauration après rafraîchissement.

```tsx
const { filters, page, sorting, update, setSearch } = useListQuery({ status: '' });
// URL : /admin/patients?search=dupont&status=ACTIVE&page=2
```

### Rafraîchissement transparent du jeton

L'intercepteur axios gère l'expiration sans intervention de l'utilisateur :

```
Requête → 401 TOKEN_EXPIRED
   ↓
Un seul appel /auth/refresh (promesse partagée)
   ↓
Nouveau jeton stocké → requête initiale rejouée
   ↓
Si échec → session effacée → redirection vers /connexion
```

La promesse de rafraîchissement est **mutualisée** : dix requêtes simultanées ne
déclenchent qu'un seul appel réseau.

### Composant `<Can>`

```tsx
<Can permission="patient:create">
  <Button>Nouveau patient</Button>
</Can>

<Can anyOf={['invoice:create', 'invoice:manage']} fallback={<p>Accès restreint</p>}>
  <InvoiceForm />
</Can>
```

Le menu latéral est **généré** depuis `ADMIN_NAV`, chaque entrée déclarant sa
permission : un pharmacien ne voit ni la facturation ni les utilisateurs.

> Le contrôle d'affichage est un confort d'usage, **pas** une sécurité. Toute
> route est de toute façon protégée côté API.

---

## 5. Stratégie de sécurité

### Authentification

| Mécanisme | Détail |
| --- | --- |
| **Hachage** | bcrypt, 12 tours (configurable via `BCRYPT_ROUNDS`) |
| **Jeton d'accès** | JWT HS256, 15 min, contient `sub`, `email`, `roles`, `permissions` |
| **Jeton de rafraîchissement** | Chaîne opaque de 64 octets, stockée **hachée en SHA-256** |
| **Transport du refresh** | Cookie `httpOnly` + `sameSite=lax` + `secure` en production |
| **Rotation** | Chaque rafraîchissement révoque l'ancien jeton et en émet un nouveau |
| **Détection de rejeu** | Un jeton déjà consommé révoque **toutes** les sessions de l'utilisateur |
| **Révocation** | À la déconnexion, au changement de mot de passe, à la désactivation |

### Anti-énumération de comptes

```ts
const passwordMatches = await bcrypt.compare(
  input.password,
  record?.password_hash ?? DUMMY_HASH,   // comparaison systématique
);

if (!record || !passwordMatches) {
  throw AppError.unauthorized('Email ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
}
```

Le message est identique dans les deux cas, et la comparaison bcrypt a toujours
lieu : le temps de réponse ne révèle pas l'existence du compte.

### Injections SQL

**Aucune concaténation de valeur.** Toutes les requêtes utilisent des marqueurs `?` :

```ts
await query('SELECT * FROM patients WHERE email = ? AND id = ?', [email, id]);
```

Le tri et les `SET` dynamiques passent par des **listes blanches** :

```ts
buildOrderBy(sort, order, { last_name: 'p.last_name', created_at: 'p.created_at' }, 'p.id');
// Une clé inconnue retombe sur 'p.id' — jamais de valeur client dans le SQL
```

### Autres protections

| Menace | Contre-mesure |
| --- | --- |
| **XSS** | React échappe par défaut ; aucun `dangerouslySetInnerHTML` |
| **CSRF** | Cookie `sameSite=lax` + jeton en en-tête `Authorization` |
| **Force brute** | Limiteur dédié : 10 tentatives échouées / 15 min sur `/auth/*` |
| **Déni de service** | Limiteur global 300 req / 15 min, `helmet`, corps limité à 2 Mo |
| **Clickjacking** | `X-Frame-Options` via helmet |
| **Traversée de répertoire** | Noms de fichiers téléversés générés aléatoirement |
| **Fichiers malveillants** | Contrôle MIME strict (PNG, JPEG, WEBP, PDF), taille limitée |
| **Fuite de secrets** | Les secrets Zoom ne quittent jamais le serveur |
| **Élévation de privilèges** | Rôles/permissions rechargés en base à **chaque** requête |

### Validation des entrées

Toute entrée est validée par Zod avant d'atteindre le service :

```ts
router.post('/', authenticate, requirePermission('patient:create'),
  validate({ body: createPatientSchema }), controller.create);
```

Les données validées **remplacent** `req.body` / `req.query` / `req.params` : les
contrôleurs ne manipulent que des valeurs vérifiées et converties.

---

## 6. Contrôle d'accès (RBAC)

### Modèle de données

```
users ──< user_roles >── roles ──< role_permissions >── permissions
```

- **`roles`** : 8 rôles système (`is_system = TRUE`, non supprimables) + rôles
  personnalisés créés par un administrateur.
- **`permissions`** : 77 lignes, format `resource:action`, avec contrainte CHECK
  sur l'action.
- **`user_roles`** : N-N, permettant le cumul (le SUPER_ADMIN porte deux rôles
  dans le jeu de démonstration).
- **`role_permissions`** : la matrice, modifiable depuis l'interface.

### Pourquoi N-N et non une colonne `role_id` ?

Le modèle initial du cahier des charges prévoyait `users.role_id`. Ce choix viole
la BCNF dès qu'un utilisateur cumule plusieurs rôles, et interdit le cumul sans
duplication. La table de jointure `user_roles` corrige les deux problèmes.

### Résolution des permissions

```
Jeton JWT (rôles + permissions) → vérification rapide
        ↓
Rechargement en base à chaque requête (loadAuthUserById)
        ↓
req.user.permissions = union des permissions des rôles
        ↓
requirePermission(code) → hasPermission(permissions, code)
```

Le rechargement en base a un coût (une requête SQL agrégée par appel) mais garantit
qu'une révocation est **immédiatement** effective — sans attendre les 15 minutes
d'expiration du jeton.

### Héritage `manage`

```ts
export function hasPermission(granted: string[], required: string): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  const [resource] = required.split(':');
  return granted.includes(`${resource}:manage`);  // manage ⇒ create|read|update|delete
}
```

### Isolation des données patient

Au-delà des permissions, une règle métier empêche un patient d'accéder aux données
d'un autre. Elle s'applique aux dossiers, rendez-vous, ordonnances, factures et
**documents PDF** :

```ts
const isPatientOnly = user.roles.length === 1 && user.roles[0] === 'PATIENT';
if (isPatientOnly && user.patientId !== ownerPatientId) {
  throw AppError.forbidden('Ce document ne vous appartient pas.', 'DOCUMENT_NOT_OWNED');
}
```

---

## 7. Persistance et intégrité

### Choix : SQL brut, sans ORM

| Avantage | Contrepartie |
| --- | --- |
| Maîtrise totale des requêtes et des plans d'exécution | Plus de code à écrire |
| Aucune requête surprise générée par une abstraction | Mapping manuel des lignes |
| Accès direct aux fonctions MySQL (vues, triggers, JSON) | Pas de migration automatique |
| Requêtes préparées explicites | — |

C'était une **exigence explicite** du cahier des charges.

### Le pool de connexions

```ts
export const pool = mysql.createPool({
  host, port, user, password, database,
  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,   // 10 par défaut
  charset: 'utf8mb4_unicode_ci',
  dateStrings: true,       // les dates restent des chaînes 'AAAA-MM-JJ HH:MM:SS'
  supportBigNumbers: true,
});
```

`dateStrings: true` évite les conversions de fuseau intempestives : une date de
naissance ne se décale pas d'un jour selon le fuseau du serveur.

### Transactions

```ts
export async function withTransaction<T>(
  handler: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();   // toujours rendre la connexion au pool
  }
}
```

Utilisée pour : inscription patient, création de facture avec lignes, création
d'ordonnance, dispensation, approbation de téléconsultation, mise à jour des rôles.

### Intégrité garantie par la base

Trois mécanismes empêchent la désynchronisation, **quelle que soit la voie d'écriture**
(application, phpMyAdmin, script) :

**1. Le stock est dérivé des mouvements**

```sql
CREATE TRIGGER trg_stock_movement_after_insert
AFTER INSERT ON stock_movements
FOR EACH ROW
BEGIN
  IF NEW.type = 'IN' THEN
    UPDATE medications SET stock_quantity = stock_quantity + NEW.quantity
    WHERE id = NEW.medication_id;
  ELSE
    UPDATE medications SET stock_quantity = stock_quantity - NEW.quantity
    WHERE id = NEW.medication_id;
  END IF;
END
```

Un trigger `BEFORE INSERT` refuse une sortie supérieure au stock disponible
(`SIGNAL SQLSTATE '45000'`). L'application ne modifie **jamais** `stock_quantity`
directement.

**2. Les totaux de facture sont recalculés**

`subtotal`, `vat_amount`, `total_amount` sont recalculés à partir des lignes ;
`paid_amount` et `status` à partir des paiements. L'API relit la facture après
écriture au lieu de faire confiance à ses propres calculs.

**3. `line_total` est une colonne générée**

```sql
`line_total` DECIMAL(12,2) AS (`quantity` * `unit_price`) STORED
```

Elle ne peut pas être incohérente : MySQL la calcule et interdit toute écriture.

### Les vues comme contrat

14 vues exposent des lectures dénormalisées (`v_appointment_details`,
`v_invoice_details`, `v_patient_history`…). Bénéfices :

- les jointures complexes sont écrites **une fois** ;
- le schéma peut évoluer sans casser les écrans ;
- les colonnes calculées (`balance_due`, `is_overdue`, `is_joinable`) sont
  disponibles partout.

---

## 8. Intégration Zoom

### Deux mécanismes complémentaires

```
┌─────────────────────────────────────────────────────────────┐
│ 1. REST API v2 — Server-to-Server OAuth  (côté serveur)     │
│    POST /users/me/meetings   → créer une réunion            │
│    DELETE /meetings/{id}     → supprimer                    │
│    Jeton OAuth mis en cache (expiration - 60 s)             │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 2. Meeting SDK  (côté navigateur)                           │
│    Le back signe un JWT HS256 avec ZOOM_SDK_SECRET          │
│    Le front charge le SDK depuis le CDN et rejoint           │
└─────────────────────────────────────────────────────────────┘
```

Le secret SDK ne quitte **jamais** le serveur : seule la signature est transmise.

### Mode dégradé (par défaut)

```ts
export function isZoomConfigured(): boolean {
  return env.zoomEnabled;   // les 3 variables OAuth sont-elles remplies ?
}

export async function createZoomMeeting(input) {
  if (!isZoomConfigured()) {
    const id = simulatedMeetingId();
    return { id, join_url: `https://zoom.us/j/${id}`, …, simulated: true };
  }
  // … appel réel
}
```

Sans identifiants, `config/zoom.ts` produit des **données simulées cohérentes** :
identifiant à 11 chiffres, URL de connexion, mot de passe, `start_url`. L'application
est pleinement fonctionnelle hors ligne, ce qui permet la démonstration sans
compte Zoom.

Côté front, `MeetingRoom.tsx` tente de charger le SDK depuis le CDN ; en cas
d'échec (pas de réseau, pas de dépendance), il bascule sur une **salle de
démonstration** avec vignettes, contrôles micro/caméra et compte à rebours.

### Fenêtre de connexion

```ts
export function isJoinWindowOpen(startTime, duration, reference = new Date()): boolean {
  const opensAt  = start.getTime() - MEETING_JOIN_WINDOW_MINUTES * 60_000;  // 10 min avant
  const closesAt = start.getTime() + duration * 60_000;
  return reference.getTime() >= opensAt && reference.getTime() <= closesAt;
}
```

Vérifiée **côté serveur** sur `join-token` (le client ne peut pas la contourner).

---

## 9. Génération des documents PDF

### Architecture

```
pdf.routes.ts → pdf.controller.ts → pdf.service.ts → pdf.repository.ts
                                          ↓
                              utils/pdf.generator.ts
                                          ↓
                                     pdfkit (Buffer)
```

`pdf.service.ts` fait la traduction entre les lignes SQL brutes et les structures
attendues par le générateur (conversion des types, calculs dérivés, nommage des
fichiers). Le générateur ne connaît que des objets typés — il est donc testable
indépendamment de la base.

### Six modèles

| Document | Contenu |
| --- | --- |
| Dossier patient | Identité, groupe sanguin, allergies, antécédents, contact d'urgence, chronologie complète |
| Ordonnance | Prescripteur (spécialité, n° d'ordre), patient, lignes, espace de signature |
| Compte-rendu | Diagnostic, observations, suivi prévu, ordonnances associées |
| Facture | Lignes, total HT, TVA, TTC, payé, solde dû, historique des paiements |
| Bon de dispensation | Produits à délivrer, cases à cocher, instructions, signature pharmacien |
| Planning des gardes | Tableau par garde, récapitulatif par médecin (gardes, heures) |

### Éléments communs

**En-tête** sur chaque page : logo (`public/logo.png` si présent) ou monogramme
« MC » dessiné, nom de la clinique, adresse, téléphone, e-mail, filet vert.

**Pied de page** sur chaque page : `Page X / Y`, date d'édition, nom du document,
mention « Document confidentiel — usage médical ».

**Tableaux paginés** : dessinés manuellement (`doc.rect`, `doc.text`), avec saut de
page automatique et **réaffichage de l'en-tête de colonnes**. Aucune ligne n'est
coupée entre deux pages. Les textes trop longs sont tronqués avec une ellipse
calculée par `doc.widthOfString`.

La numérotation `Page X / Y` exploite `bufferPages: true` : le générateur revient
sur chaque page en fin de course pour y inscrire le total.

### Contrôle d'accès

Un patient ne peut télécharger que ses propres documents. Chaque accès est
journalisé (`action: PDF_ACCESS`) avec l'IP et l'agent utilisateur, sans jamais
faire échouer la génération.

---

## 10. Journalisation et audit

### Deux niveaux

**1. Journal HTTP** (`morgan`) — une ligne par requête en développement, silencieux
en production et en test.

**2. Journal d'audit** (table `audit_logs`) — les actions sensibles, avec
l'utilisateur, l'action, la ressource, l'identifiant, les valeurs avant/après (JSON),
l'adresse IP et l'agent utilisateur.

### Middleware `auditTrail`

```ts
router.post('/', authenticate, requirePermission('patient:create'),
  auditTrail('CREATE', 'patient'), controller.create);
```

Le middleware s'installe **en amont** et écoute l'événement `finish` de la réponse.
Le journal n'est écrit que si le statut est **< 400** — inutile de tracer les
tentatives refusées, déjà tracées par les erreurs.

Le contrôleur enrichit le contenu :

```ts
setAuditPayload(res, { resourceId: created.id, newValue: { … } });
```

### Actions journalisées

`CREATE`, `UPDATE`, `DELETE`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `APPROVE`,
`REJECT`, `PDF_ACCESS`, `DISPENSE`, `STOCK_ADJUST`.

### Robustesse

`writeAuditLog` **ne lève jamais d'exception** : une panne d'écriture d'audit ne
doit pas faire échouer l'opération métier. L'erreur est journalisée en console.

### Index

```sql
KEY idx_audit_user (user_id, created_at)
KEY idx_audit_resource (resource, resource_id)
KEY idx_audit_action (action)
KEY idx_audit_created (created_at)
```

Ces index couvrent exactement les filtres exposés par `GET /api/audit`.

---

## 11. Gestion des erreurs

### `AppError`

Toutes les erreurs métier sont des `AppError` :

```ts
export class AppError extends Error {
  statusCode: number;   // 400, 401, 403, 404, 409, 422, 429, 500, 503
  code: string;         // code fonctionnel stable (ex. 'INSUFFICIENT_STOCK')
  details?: unknown;    // contexte additionnel
  isOperational: boolean; // true = 4xx attendu, false = bug
}
```

Fabriques : `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`,
`unprocessable`, `tooManyRequests`, `internal`, `serviceUnavailable`.

### Traduction des erreurs MySQL

`error.middleware.ts` convertit les codes MySQL en réponses compréhensibles :

| Code MySQL | HTTP | Code applicatif |
| --- | --- | --- |
| `ER_DUP_ENTRY` | 409 | `DUPLICATE_ENTRY` |
| `ER_NO_REFERENCED_ROW_2` | 422 | `FOREIGN_KEY_MISSING` |
| `ER_ROW_IS_REFERENCED_2` | 409 | `FOREIGN_KEY_CONSTRAINT` |
| `ER_CHECK_CONSTRAINT_VIOLATED` | 422 | `CHECK_CONSTRAINT` |
| `ER_DATA_TOO_LONG` | 400 | `DATA_TOO_LONG` |
| `SQLSTATE 45000` | 409 | `BUSINESS_RULE_VIOLATION` (trigger) |
| `ECONNREFUSED` | 503 | `DATABASE_UNAVAILABLE` |

Cas notable : `SQLSTATE 45000` est émis par les triggers métier (`SIGNAL`). Le
middleware le traduit en `409 BUSINESS_RULE_VIOLATION` en conservant le message
d'origine — ainsi « Stock insuffisant pour enregistrer cette sortie. » remonte
tel quel jusqu'à l'utilisateur.

### Fuite d'information

Une erreur inattendue (5xx) est journalisée intégralement côté serveur mais
renvoyée **génériquement** en production. En développement, le message réel est
conservé pour faciliter le diagnostic.

---

## 12. Décisions d'architecture

### ADR-01 — SQL brut plutôt qu'un ORM

**Contexte** : exigence explicite du cahier des charges.
**Décision** : `mysql2/promise` avec requêtes préparées, aucun ORM.
**Conséquences** : maîtrise complète des plans d'exécution et des index ; code plus
verbeux ; mapping manuel ; aucune migration automatique (scripts SQL versionnés).

### ADR-02 — Paquet partagé consommé en source

**Contexte** : éviter la divergence de validation front/back.
**Décision** : exporter les sources TypeScript directement, sans build.
**Conséquences** : développement plus rapide, un seul `tsc` au build de production.
**Alternative écartée** : build séparé du paquet — cycles de développement plus lents.

### ADR-03 — Jetons de rafraîchissement opaques et à usage unique

**Contexte** : un JWT de rafraîchissement ne peut pas être révoqué.
**Décision** : chaîne aléatoire stockée hachée en base, rotation à chaque usage,
détection de rejeu.
**Conséquences** : révocation immédiate possible ; une requête SQL supplémentaire
par rafraîchissement ; en cas de rejeu détecté, toutes les sessions sont révoquées.

### ADR-04 — Permissions rechargées à chaque requête

**Contexte** : un jeton de 15 minutes peut porter des droits obsolètes.
**Décision** : recharger rôles et permissions en base à chaque requête.
**Conséquences** : révocation immédiatement effective ; une requête SQL agrégée
par appel authentifié ; coût acceptable pour une application de cette échelle.

### ADR-05 — Intégrité métier déléguée à la base

**Contexte** : le stock et les totaux de facture ne doivent jamais diverger.
**Décision** : triggers MySQL pour synchroniser le stock et recalculer les totaux ;
colonnes générées pour `line_total`.
**Conséquences** : cohérence garantie même hors application ; logique métier
partagée entre SQL et TypeScript ; les triggers doivent être documentés (c'est
fait dans `03_mpd.md`).

### ADR-06 — Mode Zoom dégradé obligatoire

**Contexte** : la démonstration doit fonctionner sans compte Zoom ni réseau.
**Décision** : `config/zoom.ts` renvoie des données simulées si les identifiants
sont absents ; repli visuel côté front.
**Conséquences** : projet démontrable partout ; le code réel reste présent et
s'active dès que les variables sont renseignées.

### ADR-07 — État des listes dans l'URL

**Contexte** : un back-office doit permettre de partager un écran filtré.
**Décision** : hook `useListQuery` synchronisant filtres/page/tri avec la query string.
**Conséquences** : liens partageables, retour navigateur fonctionnel, rechargement
sans perte de contexte ; une dépendance à `react-router-dom`.

### ADR-08 — Courriers non bloquants

**Contexte** : une panne SMTP ne doit pas faire échouer une consultation.
**Décision** : `sendMail` renvoie un booléen et capture toutes les erreurs.
**Conséquences** : résilience ; en contrepartie, un échec d'envoi passe inaperçu
— il est journalisé en console.

---

## 13. Diagrammes de séquence

### Connexion avec rotation du jeton

```
Client                    API                        MySQL
  │                        │                           │
  ├─POST /auth/login──────►│                           │
  │                        ├─SELECT user + roles──────►│
  │                        │◄──────────────────────────┤
  │                        ├─bcrypt.compare()          │
  │                        ├─signAccessToken()         │
  │                        ├─INSERT refresh_token─────►│
  │                        ├─UPDATE last_login_at─────►│
  │                        ├─writeAuditLog(LOGIN)─────►│
  │◄─200 {user, tokens}────┤                           │
  │  + cookie httpOnly     │                           │
  │                        │                           │
  ├─GET /patients─────────►│                           │
  │  Bearer <expired>      ├─verify → TOKEN_EXPIRED    │
  │◄─401 TOKEN_EXPIRED─────┤                           │
  │                        │                           │
  ├─POST /auth/refresh────►│                           │
  │  (cookie)              ├─SELECT refresh_token─────►│
  │                        │  revoked_at IS NULL ?     │
  │                        ├─revokeRefreshToken()─────►│
  │                        ├─issueSession() (nouveaux) │
  │◄─200 {user, tokens}────┤                           │
  │                        │                           │
  ├─GET /patients (retry)─►│                           │
  │◄─200 [patients]────────┤                           │
```

### Dispensation d'ordonnance

```
Pharmacien           API                         MySQL
    │                 │                            │
    ├─POST /prescriptions/12/dispense─────────────►│
    │                 │                            │
    │                 ├─SELECT prescription────────►│
    │                 │  status = 'ISSUED' ?       │
    │                 │                            │
    │                 ├─SELECT medications + stock►│
    │                 │  (quantités cumulées)      │
    │                 │                            │
    │                 │  stock suffisant ?         │
    │                 │  NON → 409 INSUFFICIENT_STOCK
    │                 │  OUI ↓                     │
    │                 ├─BEGIN TRANSACTION──────────►│
    │                 ├─UPDATE prescriptions────────│
    │                 │  SET status='DISPENSED'    │
    │                 ├─INSERT stock_movements OUT──│
    │                 │  (1 par ligne)             │
    │                 │      ↓ trigger             │
    │                 │  UPDATE medications        │
    │                 │  SET stock_quantity = -n   │
    │                 ├─COMMIT─────────────────────►│
    │                 ├─SELECT ordonnance (relire)──►│
    │                 ├─sendMail (catch, non bloquant)
    │◄─200 ordonnance─┤                            │
```

### Création de facture avec calcul par trigger

```
Comptable            API                         MySQL
    │                 │                            │
    ├─POST /invoices {items[]}────────────────────►│
    │                 ├─BEGIN TRANSACTION──────────►│
    │                 ├─SELECT MAX(id) (dans tx)───►│
    │                 ├─INSERT invoices────────────►│
    │                 │  (numéro FAC-AAAA-NNNNNN)  │
    │                 │  subtotal=0, total=0       │
    │                 ├─INSERT invoice_items (n)───►│
    │                 │      ↓ trigger             │
    │                 │  UPDATE invoices SET       │
    │                 │  subtotal, vat_amount,     │
    │                 │  total_amount              │
    │                 ├─COMMIT─────────────────────►│
    │                 ├─SELECT facture (relire)─────►│
    │◄─201 {invoice}──┤  (montants calculés par la base)
```

> L'API ne calcule **jamais** les totaux : elle relit l'état réel produit par les
> triggers. C'est la garantie qu'aucune divergence ne peut apparaître.

---

## 14. Performances

### Index

40 contraintes de clé étrangère et une trentaine d'index explicites couvrent les
filtres réellement utilisés :

| Table | Index | Requête servie |
| --- | --- | --- |
| `appointments` | `(doctor_id, scheduled_at)` | Agenda d'un médecin |
| `appointments` | `(patient_id, scheduled_at)` | Historique d'un patient |
| `appointments` | `(status)`, `(scheduled_at)` | Filtres de liste |
| `invoices` | `(patient_id, issued_at)`, `(status)` | Facturation |
| `stock_movements` | `(medication_id, created_at)` | Historique de stock |
| `audit_logs` | `(user_id, created_at)`, `(resource, resource_id)`, `(created_at)` | Journal |
| `notifications` | `(user_id, is_read, created_at)` | Cloche de notifications |

### Requêtes

- **Pas de N+1** : les lignes d'ordonnances sont chargées avec un `WHERE … IN (…)`,
  pas en boucle.
- **Comptage séparé** : `SELECT COUNT(*)` sur les mêmes filtres plutôt que
  `SQL_CALC_FOUND_ROWS`.
- **Vues** pour les jointures lourdes : les listes lisent `v_appointment_details`
  plutôt que de réécrire quatre jointures.
- **`GROUP_CONCAT`** avec `DISTINCT` pour agréger rôles et permissions en une
  requête, en évitant l'explosion du produit cartésien.

### Front-end

- **Code splitting** par page (`React.lazy`) : le site public ne charge pas le back-office.
- **Recharts isolé** dans un chunk dédié, chargé uniquement sur les écrans à graphiques.
- **`staleTime` de 30 s** : évite les rechargements inutiles à chaque navigation.
- **Recherche retardée** (`useDebounce`, 350 ms) : une requête après la frappe, pas
  une par caractère.
- **Squelettes de chargement** plutôt que des écrans vides.

---

## 15. Limites connues et évolutions

### Limites assumées

| Limite | Justification / impact |
| --- | --- |
| **Pas de migrations versionnées** | Scripts SQL idempotents (`DROP … IF EXISTS`), suffisants pour un projet académique ; en production, un outil comme Flyway serait requis |
| **Zoom simulé par défaut** | Choix délibéré pour la démonstration hors ligne ; le code réel est présent et s'active par configuration |
| **Pas de tests d'intégration HTTP** | Les tests couvrent la sécurité et la validation sans base ; des tests Supertest end-to-end nécessiteraient une base de test dédiée |
| **Audit non partitionné** | `audit_logs` croît indéfiniment ; une purge ou un partitionnement par mois serait nécessaire à long terme |
| **Pas de temps réel** | Les notifications sont interrogées toutes les 60 s, pas poussées par WebSocket |
| **Stockage local des fichiers** | `uploads/` sur disque ; un stockage objet (S3) serait requis en production multi-instances |

### Évolutions envisagées

1. **WebSocket / SSE** pour les notifications et l'agenda en temps réel.
2. **Tests end-to-end Playwright** couvrant les parcours critiques.
3. **Migrations versionnées** (Flyway ou Knex migrations) pour un déploiement continu.
4. **Purge automatique de l'audit** au-delà de 24 mois, avec archivage.
5. **Signature électronique** des ordonnances (intégration d'un tiers de confiance).
6. **Application mobile** réutilisant l'API (aucune dépendance au front actuel).
7. **Internationalisation** : les libellés sont centralisés dans `constants.ts`,
   une extraction vers `i18next` serait directe.
8. **Facturation électronique** conforme à la norme Factur-X.

---

## Annexe — Cartographie des dépendances entre modules

```
auth ──────────► users (hashPassword, revokeAllRefreshTokens)
  │
  ├────────────► roles, permissions (RBAC)
  │
patients ──────► appointments (historique)
  │                │
  │                ├────► consultations ──┬──► prescriptions ──► stock (dispensation)
  │                │                      └──► invoices ──► payments
  │                │
  │                └────► meetings (téléconsultation)
  │
doctors ───────► specialties, departments, shifts
  │
  └────────────► appointments, consultations, meetings

dashboard ◄───── vues SQL (v_dashboard_stats, v_revenue_by_month…)
reports   ◄───── payments, appointments, stock_movements, audit_logs
audit     ◄───── writeAuditLog (appelé par tous les modules)
pdf       ◄───── patients, prescriptions, consultations, invoices, shifts
```

Aucune dépendance circulaire entre modules : `permissions.service` interroge la
table `roles` directement plutôt que d'importer `roles.service`, précisément pour
éviter un cycle.
