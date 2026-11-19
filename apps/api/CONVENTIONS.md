# Conventions de développement — API MediClinic

Ce document est **normatif** : tout module du back-end doit s'y conformer.
L'implémentation de référence est le module `src/modules/auth`
(`auth.repository.ts` → `auth.service.ts` → `auth.controller.ts` → `auth.routes.ts`).

---

## 1. Architecture en couches

```
Route → Controller → Service → Repository → SQL brut
```

| Couche | Fichier | Responsabilité |
| --- | --- | --- |
| Route | `xxx.routes.ts` | Déclare le `Router`, branche middlewares et contrôleurs. Aucun SQL, aucune règle métier. |
| Controller | `xxx.controller.ts` | Lit `req`, appelle le service, formate la réponse. Aucune règle métier, aucun SQL. |
| Service | `xxx.service.ts` | Règles métier, vérifications, transactions, appels au repository. Aucun SQL. |
| Repository | `xxx.repository.ts` | **Uniquement** des requêtes SQL préparées (`?`). Aucune règle métier. |

Un module vit dans `src/modules/<nom>/` et exporte un `Router` nommé
`<nom>Router` (ex. `patientsRouter`), monté dans `src/routes/index.ts`.

---

## 2. Règles de code impératives

1. **Imports relatifs suffixés `.js`** (projet ESM) :
   `import { query } from '../../config/db.js';`
2. **Aucun ORM, aucun query builder.** SQL écrit à la main, valeurs passées par
   marqueurs `?`. Jamais de concaténation de valeur dans une requête.
3. **Noms de colonnes en liste blanche** pour tout tri ou `SET` dynamique
   (`buildOrderBy`, `buildSetClause` de `utils/http.ts` et `utils/pagination.ts`).
4. **Zod côté API** : les schémas viennent de `@mediclinic/shared` et sont
   appliqués par le middleware `validate({ body, query, params })`.
   Les schémas d'entrée sont en **camelCase** (`firstName`, `birthDate`) ;
   la conversion vers les colonnes **snake_case** se fait dans le service.
5. **Erreurs** : toujours `AppError` (`AppError.notFound('…', 'CODE')`), jamais
   `res.status(404)` dispersé. Messages en **français**.
6. **Handlers asynchrones** : `export const list: RequestHandler = asyncHandler(async (req, res) => {…})`.
7. **Commentaires en français**, expliquant le *pourquoi* et non le *quoi*.
8. Respecter `strict` + `noUncheckedIndexedAccess` : jamais d'accès à
   `rows[0]` sans garde (`queryOne` renvoie déjà `T | null`).

---

## 3. Format des réponses

| Cas | Corps |
| --- | --- |
| Ressource unique | `{ "data": { … } }` — `res.json({ data })` |
| Liste paginée | `{ "data": [ … ], "meta": { page, limit, total, totalPages } }` |
| Suppression / action sans contenu | `res.status(204).send()` |
| Création | `res.status(201).json({ data })` |
| Erreur | `{ "error": { "code", "message", "details"? } }` (produit par `errorHandler`) |

La liste paginée s'obtient avec `paginated(rows, total, pagination)` de
`utils/pagination.ts`, où `pagination = parsePagination(req.query)`.

---

## 4. Middlewares disponibles

```ts
import { authenticate, optionalAuthenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission, requireAnyPermission, requireRole, requireStaff } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { auditTrail, setAuditPayload } from '../../middlewares/audit.middleware.js';
import { uploadSingle } from '../../middlewares/upload.middleware.js';
```

- `authenticate` : exige un jeton valide, renseigne `req.user` (`AuthUser`).
- `requirePermission('patient:create')` : exige la permission indiquée.
  Les codes valides sont dans `@mediclinic/shared` (`PERMISSION_CODES`).
- `validate({ body: createXSchema, query: xQuerySchema, params: … })`.
- `auditTrail('CREATE', 'patient')` : journalise en fin de requête **si** le
  statut est < 400. Le contrôleur peut enrichir via
  `setAuditPayload(res, { resourceId, oldValue, newValue })`.

Ordre type d'une route d'écriture :

```ts
router.post(
  '/',
  authenticate,
  requirePermission('patient:create'),
  validate({ body: createPatientSchema }),
  auditTrail('CREATE', 'patient'),
  controller.create,
);
```

---

## 5. Accès base de données

```ts
import { query, queryOne, execute, insert, withTransaction, queryWith, executeWith } from '../../config/db.js';
```

- `query<T>(sql, params)` → `T[]`
- `queryOne<T>(sql, params)` → `T | null`
- `execute(sql, params)` → `ResultSetHeader` (`affectedRows`, `insertId`)
- `insert(sql, params)` → `insertId`
- `withTransaction(async (conn) => { … executeWith(conn, …) })`

Déclarer une interface de ligne qui étend `Row` (`RowDataPacket`) :

```ts
import type { Row } from '../../config/db.js';

interface PatientRow extends Row {
  id: number;
  first_name: string;
  /* … */
}
```

### Types de colonnes renvoyés par le pilote

| Type SQL | Type JS renvoyé | Remarque |
| --- | --- | --- |
| `INT`, `SMALLINT`, `TINYINT(1)` | `number` | `TINYINT(1)` ⇒ `0`/`1` à convertir avec `Boolean()` |
| `DECIMAL(10,2)` | **`string`** | conforme aux types partagés (`price: string`) |
| `DATE` | `string` `'AAAA-MM-JJ'` | `dateStrings: true` |
| `DATETIME`, `TIMESTAMP` | `string` `'AAAA-MM-JJ HH:MM:SS'` | idem |
| `JSON` | `object` ou `string` | utiliser `parseJsonColumn` de `utils/http.ts` |
| `NULL` | `null` | |

Pour convertir une date entrante : `toMySqlDateTime` / `toMySqlDate`
(`utils/datetime.ts`). Pour une agrégation numérique :
`Number(row.total ?? 0)`.

---

## 6. Vues SQL à privilégier en lecture

Les vues de `database/migrations/002_views.sql` évitent de réécrire les
jointures. À utiliser pour les **listes et détails**, jamais pour les écritures.

| Vue | Usage |
| --- | --- |
| `v_patient_history` | `GET /api/patients/:id/history` (une ligne par événement) |
| `v_appointment_details` | listes et agenda des rendez-vous |
| `v_consultation_details` | listes de consultations |
| `v_prescription_details` | listes d'ordonnances |
| `v_invoice_details` | listes de factures (`balance_due`, `is_overdue`) |
| `v_doctor_directory` | annuaire public des médecins |
| `v_low_stock_medications` | alertes de stock |
| `v_top_medications` | statistiques de dispensation |
| `v_revenue_by_month` | rapport de chiffre d'affaires |
| `v_appointments_by_department` | graphique par département |
| `v_consultations_by_doctor` | graphique par médecin |
| `v_shift_calendar` | planning des gardes |
| `v_active_meetings` | téléconsultations et fenêtre de connexion |
| `v_dashboard_stats` | indicateurs du tableau de bord (une ligne) |

---

## 7. Règles métier transverses

- **Stock** : `medications.stock_quantity` est **piloté par trigger**. On ne
  l'écrit jamais directement : on insère un `stock_movements` (`IN`/`OUT`).
  Un `OUT` supérieur au stock disponible est refusé par le trigger
  (`SQLSTATE 45000` → traduit en HTTP 409).
- **Factures** : `subtotal`, `vat_amount`, `total_amount` sont recalculés par
  trigger à partir des lignes ; `paid_amount` et `status` à partir des
  paiements. Le service ne doit donc **pas** les écrire (sauf `vat_rate`).
- **Téléconsultations** : `utils` Zoom dans `src/config/zoom.ts`
  (`isZoomConfigured()`, `createZoomMeeting()`, `generateZoomSignature()`).
  Sans identifiants, le service doit produire des données **simulées** et
  l'application doit rester pleinement fonctionnelle.
- **Suppression** : préférer la désactivation (`is_active = FALSE`) pour les
  utilisateurs. Les suppressions physiques sont réservées aux entités sans
  historique.

---

## 8. Vérification avant de rendre un module

```bash
cmd /c "npx tsc -p apps/api/tsconfig.json --noEmit"
```

Erreurs attendues `0`. Si des erreurs proviennent de fichiers **hors de votre
périmètre**, ne les corrigez pas : signalez-les.
