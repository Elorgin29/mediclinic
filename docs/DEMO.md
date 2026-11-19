# Checklist de démonstration — MediClinic

Scénario de soutenance, minuté et reproductible.

**Durée totale : 20 à 25 minutes** · **Prérequis : voir §0**

---

## 0. Préparation (à faire avant la soutenance)

### Vérifications techniques

```bash
# 1. Dépendances installées
npm install

# 2. Base de données initialisée avec le jeu de démonstration
npm run db:reset

# 3. Vérification statique du SQL (21 contrôles)
node database/scripts/verify-sql.mjs

# 4. TypeScript strict, tous workspaces
npm run typecheck

# 5. Tests automatisés (68 tests)
npm run test
```

### Lancement

```bash
npm run dev
```

Attendre :
- `[api] MediClinic écoute sur http://localhost:4000` ;
- `VITE ready` sur http://localhost:5173.

### Vérification de santé

```bash
curl http://localhost:4000/api/health
```

Doit renvoyer `"status": "ok"` et `"database": "connected"`.

### Onglets à préparer

| Onglet | URL | Compte |
| --- | --- | --- |
| 1. Site public | http://localhost:5173 | — |
| 2. Admin | http://localhost:5173/connexion | `superadmin@mediclinic.fr` |
| 3. Pharmacien | http://localhost:5173/connexion | `paul.mercier@mediclinic.fr` |
| 4. Patient | http://localhost:5173/connexion | `lucie.durand@email.fr` |
| 5. phpMyAdmin | http://localhost:8081 | `mediclinic` / `mediclinic` |

**Mot de passe commun : `Passw0rd!2026`**

---

## 1. Présentation du projet (2 min)

> « MediClinic est une plateforme de gestion complète d'une clinique médicale
> pluridisciplinaire. Elle couvre l'intégralité du parcours de soin : prise de
> rendez-vous en ligne, dossier patient informatisé, téléconsultation, pharmacie
> avec gestion de stock, et facturation.
>
> L'application se compose de trois espaces : un site public, un espace patient et
> un back-office professionnel, avec un contrôle d'accès fin basé sur 8 rôles et
> 77 permissions.
>
> Techniquement : React 18 et TypeScript côté front, Node/Express côté back, et
> MySQL 8 avec du SQL entièrement écrit à la main — aucun ORM — conformément au
> cahier des charges. »

**Montrer** : l'arborescence du dépôt (monorepo à trois workspaces).

---

## 2. Site public et prise de rendez-vous (4 min)

### 2.1 Page d'accueil

**Onglet 1** → http://localhost:5173

**Montrer** :
- Bannière avec les chiffres clés (8 médecins, 10 spécialités, 8 départements).
- Carte de contact avec horaires d'ouverture.
- Les 10 spécialités chargées **depuis l'API** (pas de données codées en dur).
- Les praticiens avec leur tarif.

**Dire** :
> « Cette page ne nécessite aucune authentification. Les données proviennent des
> routes publiques de l'API : `/specialties` et `/doctors/public`. Cette dernière
> lit une vue SQL qui filtre sur les praticiens accueillant de nouveaux patients
> et n'expose aucune donnée sensible. »

### 2.2 Annuaire des médecins

Cliquer sur **Nos médecins**.

**Montrer** :
- Filtre par spécialité et recherche par nom.
- L'URL se met à jour : `?specialtyId=1&search=haddad` — **le lien est partageable**.
- Cliquer sur « Cardiologie » : la liste se filtre instantanément.

**Dire** :
> « Les filtres sont synchronisés avec l'URL : on peut partager un écran filtré,
> et un rechargement conserve le contexte. »

### 2.3 Prise de rendez-vous

Cliquer sur **Réserver** sur un médecin.

**Dérouler l'assistant en 3 étapes :**

1. **Praticien** — déjà présélectionné.
2. **Créneau** — choisir une date à J+3, puis un horaire libre.
   - *Montrer* : les créneaux déjà réservés n'apparaissent pas.
3. **Coordonnées** — renseigner un nouveau patient :
   - Prénom : `Test`, Nom : `Démonstration`
   - Date de naissance : `1990-01-15`
   - Email : `demo.soutenance@email.fr`
   - Téléphone : `0612345678`

Cliquer sur **Confirmer le rendez-vous**.

**Montrer** : écran de confirmation avec le numéro de rendez-vous et la mention
« Dossier créé automatiquement ».

**Vérifier en base** (phpMyAdmin ou terminal) :

```sql
SELECT id, patient_id, scheduled_at, status, created_by
FROM appointments ORDER BY id DESC LIMIT 1;
```

→ `status = 'PENDING'`, `created_by = NULL` (réservation publique).

**Dire** :
> « Le rendez-vous est créé au statut « en attente » : le secrétariat doit le
> confirmer. Les réceptionnistes reçoivent une notification. Et si l'email était
> inconnu, un dossier patient minimal a été créé dans la même transaction — on ne
> laisse jamais de rendez-vous orphelin. »

---

## 3. Back-office : tableau de bord (3 min)

**Onglet 2** → se connecter avec `superadmin@mediclinic.fr`

### 3.1 Tableau de bord

**Montrer** :
- **6 indicateurs** : rendez-vous du jour, CA du mois (avec variation vs mois
  précédent), patients, téléconsultations en attente, alertes de stock, gardes en cours.
- **Graphique de CA** : 12 points, aire dégradée.
- **Rendez-vous par département** : barres horizontales.
- **Consultations par médecin** : barres verticales colorées.
- **Top médicaments** : camembert.
- **Alertes de stock** et **activité récente**.

**Dire** :
> « Tous ces indicateurs proviennent d'un seul appel à `/dashboard/stats`, qui
> s'appuie sur une vue SQL. Les graphiques sont en Recharts, chargés
> paresseusement : le site public ne télécharge pas cette bibliothèque. »

### 3.2 Isolation des données patient

Se déconnecter, se reconnecter avec `lucie.durand@email.fr` (PATIENT).

**Montrer** : l'espace patient s'ouvre automatiquement (pas le back-office).

**Dire** :
> « L'utilisateur est redirigé vers son espace selon ses rôles. Un patient ne peut
> pas accéder au back-office, et inversement. »

Se reconnecter en `superadmin@mediclinic.fr` pour la suite.

---

## 4. Contrôle d'accès RBAC (4 min)

### 4.1 Menu filtré par permissions

**Onglet 3** → se connecter avec `paul.mercier@mediclinic.fr` (PHARMACIST).

**Montrer** le menu latéral :
- **Visible** : Médicaments, Stock, Ordonnances, Téléconsultations, Patients, Rapports.
- **Invisible** : Factures, Paiements, Utilisateurs, Rôles, Paramètres.

**Dire** :
> « Le menu est généré dynamiquement à partir des permissions effectives. Un
> pharmacien n'a aucune raison de voir la facturation ou la gestion des comptes. »

### 4.2 Refus d'accès direct

Tenter d'ouvrir directement : http://localhost:5173/admin/factures

**Attendu** : page **« Accès refusé »** avec un message explicite.

### 4.3 Refus côté API

Ouvrir la console du navigateur (F12) et exécuter :

```js
const t = JSON.parse(localStorage.getItem('mediclinic.access_token') ?? '""');
// Récupérer le jeton réel puis :
const token = localStorage.getItem('mediclinic.access_token');
fetch('http://localhost:4000/api/users', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json()).then(console.log);
```

**Attendu** :

```json
{ "error": { "code": "PERMISSION_DENIED", "message": "Vous n’avez pas la permission requise (user:read)." } }
```

**Dire** :
> « Le contrôle d'affichage est un confort d'usage, pas une sécurité. Chaque route
> est de toute façon protégée côté API : même en contournant l'interface, l'accès
> est refusé. »

### 4.4 Matrice RBAC modifiable

Se reconnecter en `superadmin@mediclinic.fr` → **Rôles & permissions**.

**Montrer** :
- La liste des 8 rôles avec leur nombre de permissions.
- Le cadenas sur les rôles système.
- La grille : 21 ressources × 5 actions.

**Manipulation** :
1. Sélectionner **Infirmier(ère)** (NURSE).
2. Repérer la ligne « Ordonnances » et cocher `Consulter` si nécessaire.
3. Cliquer sur **Enregistrer**.

**Puis** : se reconnecter en `claire.dubois@mediclinic.fr` (NURSE) → le module
**Ordonnances** apparaît dans le menu.

**Dire** :
> « La matrice est stockée en base, pas dans le code. Accorder un droit ne
> nécessite aucun redéploiement. C'est la définition d'un RBAC modulaire. »

---

## 5. Cycle de soin complet (5 min)

### 5.1 Créer un rendez-vous

Se reconnecter en `superadmin@mediclinic.fr` → **Rendez-vous** → **Nouveau rendez-vous**.

- Patient : identifiant `1` (Lucie Durand)
- Médecin : Dr Amine Haddad
- Date : hier à 10h00
- Durée : 30 min
- Motif : `Contrôle de tension artérielle`

Créer.

**Montrer** : le rendez-vous apparaît dans la liste.

### 5.2 Faire évoluer son statut

Cliquer sur **Statut** → sélectionner `Arrivé` → enregistrer.
Puis → `En cours`.

### 5.3 Saisir la consultation

Aller dans **Consultations** → **Nouvelle consultation**.

- Rendez-vous : celui créé
- Diagnostic : `Hypertension artérielle stade 1`
- Observations : `Examen clinique complet, constantes stables.`
- Suivi : dans 30 jours

**Montrer** : le rendez-vous est passé **automatiquement** à `COMPLETED`.

```sql
SELECT id, status FROM appointments WHERE id = <id>;
-- → COMPLETED
```

### 5.4 Créer une ordonnance

**Ordonnances** → **Nouvelle** (ou depuis la consultation).

Ajouter deux médicaments :
- Paracétamol 500 mg — 1 comprimé, 3×/jour, 7 jours, quantité 21
- Oméprazole 20 mg — 1 gélule, 1×/jour, 14 jours, quantité 14

**Relever le stock avant dispensation** :

```sql
SELECT id, name, stock_quantity FROM medications WHERE id IN (1, 4);
```

### 5.5 Dispenser (en tant que pharmacien)

Se connecter avec `paul.mercier@mediclinic.fr` → **Ordonnances** → **Dispenser**.

**Montrer** :
- Le statut passe à `DISPENSED`.
- Le stock a **exactement** diminué des quantités prescrites.

```sql
SELECT id, name, stock_quantity FROM medications WHERE id IN (1, 4);
```

**Dire** :
> « La dispensation crée un mouvement de sortie par ligne d'ordonnance. Le stock
> n'est jamais écrit directement par l'application : ce sont les triggers MySQL
> qui le recalculent. C'est la garantie qu'aucune désynchronisation n'est possible,
> même si quelqu'un modifie la base à la main. »

### 5.6 Garde-fou SQL

Tenter une sortie supérieure au stock :

```sql
INSERT INTO stock_movements (medication_id, type, quantity, reason, user_id)
VALUES (4, 'OUT', 999999, 'Test de robustesse', 1);
```

**Attendu** :

```
ERROR 1644 (45000): Stock insuffisant pour enregistrer cette sortie.
```

**Dire** :
> « L'intégrité est garantie au niveau de la base, pas seulement de l'application.
> L'API traduit ce code SQLSTATE 45000 en erreur HTTP 409 avec le message d'origine. »

---

## 6. Facturation (3 min)

Se connecter en `hugo.charpentier@mediclinic.fr` (ACCOUNTANT) → **Factures**.

### 6.1 Créer une facture

**Nouvelle facture** :
- Patient : Lucie Durand
- Lignes :
  - `Consultation Cardiologie — Dr Haddad` · 1 × 70,00 €
  - `Électrocardiogramme` · 1 × 35,00 €
- TVA : 20 %

**Montrer** : les totaux calculés.

**Vérifier** :

```sql
SELECT subtotal, vat_amount, total_amount, paid_amount, status
FROM invoices ORDER BY id DESC LIMIT 1;
-- subtotal = 105.00 | vat = 21.00 | total = 126.00 | status = ISSUED
```

**Dire** :
> « L'API n'a jamais calculé ces montants : ce sont les triggers qui les ont
> produits à partir des lignes. L'API relit ensuite la facture pour renvoyer l'état
> réel. C'est ce qui rend impossible une facture dont le total ne correspondrait
> pas à ses lignes. »

### 6.2 Encaisser partiellement

Cliquer sur **Encaisser** → montant `50` → Carte bancaire.

**Montrer** : statut `PARTIALLY_PAID`, solde restant `76,00 €`.

### 6.3 Encaisser le solde

Encaisser `76,00 €` → statut `PAID`.

### 6.4 Tester le dépassement

Sur une autre facture, tenter d'encaisser plus que le solde.

**Attendu** : message d'erreur indiquant le solde exact, code `422 AMOUNT_EXCEEDS_BALANCE`.

### 6.5 Télécharger la facture

Cliquer sur l'icône de téléchargement.

**Montrer** le PDF :
- En-tête avec le nom de la clinique et ses coordonnées
- Tableau des lignes
- Bloc des totaux (HT, TVA, TTC, payé, solde dû)
- Pied de page `Page 1 / 1`, date d'édition, mention de confidentialité

---

## 7. Téléconsultation et mode dégradé (3 min)

### 7.1 Demander une téléconsultation

**Onglet 1** (site public) → **Téléconsultation**.

- Médecin : Dr Karim Benali
- Motif : `Suivi pédiatrique à distance pour fièvre persistante`
- Créneau : demain 10h00
- Durée : 30 min

Envoyer la demande.

### 7.2 Approuver

Se connecter en `superadmin@mediclinic.fr` → **Téléconsultations**.

**Montrer** :
- Le bandeau indique le **mode simulé** :
  > « Mode actuel : Zoom simulé (mode démonstration). Les réunions sont simulées :
  > l'application reste entièrement fonctionnelle hors ligne. »
- La demande en `PENDING`.

Cliquer sur **Approuver**.

**Montrer** :
- Statut `APPROVED`
- Identifiant de réunion généré (`845000001xx`)
- Lien et mot de passe
- Un rendez-vous a été créé automatiquement

**Dire** :
> « Sans identifiants Zoom, le service génère des données de réunion cohérentes.
> Le code d'intégration réel est présent — OAuth Server-to-Server et Meeting SDK —
> et s'active simplement en renseignant les variables d'environnement. Ce mode
> dégradé est un choix délibéré pour permettre la démonstration sans compte Zoom
> ni connexion. »

### 7.3 Rejoindre la salle

Cliquer sur **Rejoindre**.

**Montrer** : la salle de visioconférence s'ouvre avec :
- Deux vignettes (vous / participant en attente)
- Contrôles micro, caméra, partage d'écran, quitter
- Le numéro de réunion

**Dire** :
> « Le composant tente de charger le Zoom Meeting SDK depuis le CDN. En cas
> d'échec — pas de réseau, pas de dépendance — il bascule sur cette salle de
> démonstration. La signature JWT est de toute façon calculée côté serveur : le
> secret SDK ne quitte jamais le back-end. »

### 7.4 Fenêtre de connexion

**Montrer** dans le code (`apps/web/src/components/MeetingRoom.tsx`) :

```ts
const opensAt  = start.getTime() - 10 * 60_000;
const closesAt = start.getTime() + duration * 60_000;
```

**Dire** :
> « La fenêtre est vérifiée côté serveur sur la route `join-token` : impossible de
> la contourner depuis le client. »

---

## 8. Portail patient (3 min)

**Onglet 4** → se connecter avec `lucie.durand@email.fr`.

### 8.1 Tableau de bord

**Montrer** :
- Prochain rendez-vous mis en avant
- Compteurs (rendez-vous à venir, ordonnances, factures à régler, téléconsultations)
- Ordonnances récentes avec statut
- Factures avec montant et échéance

### 8.2 Dossier médical

Cliquer sur **Mon dossier médical**.

**Montrer** :
- Identité, âge calculé, groupe sanguin, n° d'assurance
- Encadré rouge des allergies
- Antécédents
- **Chronologie complète** avec badges par type d'événement (rendez-vous,
  consultation, ordonnance, facture, analyse)

**Dire** :
> « La chronologie est construite à partir de la vue `v_patient_history`, qui
> unifie cinq types d'événements en une seule requête. »

### 8.3 Télécharger son dossier

Cliquer sur **Télécharger mon dossier**.

**Montrer** le PDF complet.

### 8.4 Tester l'isolation

Modifier l'URL pour tenter d'accéder au dossier d'un autre patient :
http://localhost:5173/patient/dossier → puis dans la console :

```js
const token = localStorage.getItem('mediclinic.access_token');
fetch('http://localhost:4000/api/pdf/patient/2', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json()).then(console.log);
```

**Attendu** :

```json
{ "error": { "code": "DOCUMENT_NOT_OWNED", "message": "Ce document ne vous appartient pas." } }
```

**Dire** :
> « Au-delà des permissions RBAC, une règle métier vérifie que le patient connecté
> est bien le propriétaire du document. Un patient ne peut jamais accéder aux
> données d'un autre, même en devinant l'identifiant. »

---

## 9. Journal d'audit (2 min)

Se reconnecter en `superadmin@mediclinic.fr` → **Administration → Journal d'audit**.

**Montrer** :
- Toutes les actions réalisées pendant la démonstration
- Filtres : utilisateur, ressource, action, période
- Chaque ligne : horodatage, utilisateur, IP, action, ressource

**Filtrer** par ressource `patient` et action `CREATE`.

**Déplier** une entrée pour montrer les valeurs avant/après en JSON.

**Vérifier en base** :

```sql
SELECT action, COUNT(*) AS total FROM audit_logs GROUP BY action ORDER BY total DESC;
```

**Dire** :
> « Chaque action sensible est tracée : qui, quoi, quand, depuis quelle adresse IP.
> Le journal est en lecture seule depuis l'application — aucune entrée ne peut être
> modifiée ni supprimée. C'est une exigence forte pour un système de santé. »

---

## 10. Rapports et export (2 min)

Aller dans **Rapports**.

**Montrer** les cinq onglets :
1. **Chiffre d'affaires** — CA encaissé, factures, paiements, panier moyen, évolution
   mensuelle, répartition par moyen de paiement, meilleurs patients.
2. **Rendez-vous** — total, terminés, annulés, taux de présence, regroupement
   configurable (jour/semaine/mois/département/médecin/statut).
3. **Stock** — valeur, alertes, consommation par médicament.
4. **Activité** — actions par utilisateur et par ressource.
5. **Patients** — nouveaux patients, répartition par âge et par ville.

Changer la période : **Ce mois** → **Cette année**.

Cliquer sur **Exporter en CSV** → ouvrir dans un tableur.

**Montrer** : séparateur `;`, accents corrects (BOM UTF-8).

**Dire** :
> « Le CSV est encodé en UTF-8 avec BOM pour qu'Excel affiche correctement les
> accents, et utilise le point-virgule, séparateur attendu par Excel en
> configuration française. »

---

## 11. Planning des gardes (2 min)

Aller dans **Planning des gardes**.

**Montrer** :
- Calendrier mensuel avec une couleur stable par médecin
- Gardes de jour, de nuit et astreintes
- Navigation mois précédent / suivant
- Récapitulatif de charge par médecin (nombre de gardes, total d'heures)

Cliquer sur **Planning PDF** → **Montrer** le document généré.

**Dire** :
> « La couleur d'un médecin est dérivée de son identifiant sur une palette de dix
> couleurs : le rendu reste identique d'un mois à l'autre. Le PDF reprend le détail
> par garde et le récapitulatif par praticien. »

---

## 12. Robustesse et qualité (2 min)

### 12.1 Résilience à une panne de base

Arrêter MySQL :

```bash
docker compose stop mysql
```

Recharger l'application.

**Montrer** :
- L'API **reste démarrée** (pas de crash).
- Les écrans affichent un état d'erreur avec un bouton **Réessayer**.
- `GET /api/health` renvoie `503` avec `"database": "unreachable"`.

Redémarrer MySQL :

```bash
docker compose start mysql
```

Recharger → tout refonctionne **sans redémarrage** de l'API.

**Dire** :
> « Une panne de base ne fait pas tomber le serveur : elle est détectée et signalée
> clairement, et la reconnexion est automatique grâce au pool. »

### 12.2 Vérifications automatisées

Terminal :

```bash
# TypeScript strict sur les trois workspaces
npm run typecheck

# 68 tests
npm run test

# 21 contrôles statiques du SQL
node database/scripts/verify-sql.mjs
```

**Montrer** les sorties vertes.

**Dire** :
> « Le projet compte 68 tests automatisés. Les plus importants portent sur la
> sécurité : la matrice RBAC est vérifiée rôle par rôle, et un test confirme qu'une
> valeur de tri malveillante ne peut pas être injectée dans le SQL. »

---

## 13. Conclusion (1 min)

> « Pour résumer, MediClinic couvre l'intégralité du parcours de soin sur trois
> espaces distincts, avec un contrôle d'accès modulaire de 77 permissions.
>
> Trois points me semblent importants à souligner :
>
> **Premièrement, l'intégrité des données est garantie par la base elle-même.**
> Le stock et les totaux de facture sont maintenus par des triggers : aucune
> désynchronisation n'est possible, même en écrivant directement en SQL.
>
> **Deuxièmement, la sécurité est appliquée en profondeur** : permissions
> rechargées à chaque requête, jetons de rafraîchissement à usage unique,
> protection contre l'énumération de comptes, et une règle d'isolation qui empêche
> un patient d'accéder aux données d'un autre.
>
> **Troisièmement, l'application reste pleinement fonctionnelle hors ligne** grâce
> au mode Zoom dégradé et à l'absence de dépendance à un service externe
> obligatoire.
>
> Le projet est documenté : architecture, référence de l'API, analyse de
> normalisation BCNF, et diagrammes MCD/MLD/MPD avec dictionnaire de données
> complet. »

---

## Annexe A — Requêtes de vérification rapide

```sql
USE mediclinic;

-- Volumétrie
SELECT 'users' AS t, COUNT(*) FROM users
UNION ALL SELECT 'patients', COUNT(*) FROM patients
UNION ALL SELECT 'doctors', COUNT(*) FROM doctors
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments
UNION ALL SELECT 'consultations', COUNT(*) FROM consultations
UNION ALL SELECT 'prescriptions', COUNT(*) FROM prescriptions
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'medications', COUNT(*) FROM medications
UNION ALL SELECT 'shifts', COUNT(*) FROM shifts
UNION ALL SELECT 'meetings', COUNT(*) FROM meetings;

-- Cohérence : aucun stock négatif
SELECT COUNT(*) AS stocks_negatifs FROM medications WHERE stock_quantity < 0;
-- Attendu : 0

-- Cohérence : totaux de facture conformes aux lignes
SELECT COUNT(*) AS factures_incoherentes
FROM invoices i
JOIN (SELECT invoice_id, ROUND(SUM(line_total),2) AS sub
      FROM invoice_items GROUP BY invoice_id) t ON t.invoice_id = i.id
WHERE i.subtotal <> t.sub;
-- Attendu : 0

-- Alertes de stock
SELECT name, stock_quantity, alert_threshold
FROM medications WHERE stock_quantity <= alert_threshold;

-- Dernières actions d'audit
SELECT created_at, action, resource, resource_id, ip_address
FROM audit_logs ORDER BY id DESC LIMIT 10;
```

---

## Annexe B — Parcours de démonstration alternatif (5 min)

Version condensée si le temps manque :

1. **Site public** : accueil + réserver un rendez-vous (1 min)
2. **Connexion admin** : dashboard avec graphiques (1 min)
3. **RBAC** : menu d'un pharmacien + refus d'accès (1 min)
4. **Intégrité** : dispenser une ordonnance, montrer le stock qui baisse (1 min)
5. **PDF** : télécharger une facture (1 min)

---

## Annexe C — Questions fréquentes du jury

**« Pourquoi pas d'ORM ? »**
> C'était une exigence du cahier des charges. Cela nous a obligés à maîtriser
> chaque requête, chaque index et chaque plan d'exécution. Le compromis est un code
> plus verbeux, mais entièrement contrôlé.

**« Comment garantissez-vous que le stock est juste ? »**
> L'application n'écrit jamais `stock_quantity`. Toute variation passe par un
> mouvement (`IN`/`OUT`), et les triggers recalculent le stock. Un trigger
> `BEFORE INSERT` refuse même une sortie supérieure au disponible — la cohérence
> est garantie au niveau de la base.

**« Que se passe-t-il si un jeton est volé ? »**
> Trois barrières : le jeton d'accès expire en 15 minutes ; le jeton de
> rafraîchissement est à usage unique et rotation systématique ; et si un jeton
> déjà consommé est représenté, toutes les sessions de l'utilisateur sont révoquées
> immédiatement.

**« Les permissions sont-elles dans le jeton ? »**
> Elles y sont, mais elles ne sont pas la source de vérité : elles sont rechargées
> en base à chaque requête. Une révocation est donc effective immédiatement, sans
> attendre l'expiration du jeton.

**« Comment un patient est-il empêché de voir les données d'un autre ? »**
> Deux niveaux. Les permissions RBAC limitent les routes accessibles. Et une règle
> métier compare `req.user.patientId` au propriétaire de la ressource demandée —
> elle s'applique aussi aux documents PDF.

**« Pourquoi le mode Zoom simulé ? »**
> Pour que le projet soit démontrable sans compte Zoom ni connexion internet. Le
> code d'intégration réel (OAuth S2S + Meeting SDK) est présent et s'active par
> simple configuration. C'est un choix de conception assumé, pas une impasse
> technique.

**« Comment sont gérés les montants ? »**
> En `DECIMAL` en base, jamais en flottant. MySQL fait foi : les totaux de facture
> sont calculés par triggers à partir des lignes, et l'API relit le résultat au lieu
> de le recalculer.

**« Combien de tests ? »**
> 68 tests automatisés. Ils couvrent principalement la sécurité (matrice RBAC rôle
> par rôle, anti-injection sur le tri) et la validation (schémas Zod partagés
> front/back), qui sont les zones où une régression serait la plus coûteuse.

---

## Annexe D — En cas de problème pendant la démonstration

| Symptôme | Solution rapide |
| --- | --- |
| API ne répond pas | `npm run dev` relancé ; vérifier le port 4000 |
| Base inaccessible | `docker compose start mysql` puis attendre 10 s |
| Écran blanc | F12 → console ; vérifier `VITE_API_URL` |
| « Accès refusé » inattendu | Se reconnecter : la session a peut-être expiré |
| PDF ne se télécharge pas | Vérifier que le jeton est présent (F12 → Application → Local Storage) |
| Données incohérentes | `npm run db:reset` (réinitialise tout le jeu de démonstration) |
| Menu incomplet | Normal : dépend des permissions du rôle connecté |

**Restauration complète en cas de doute :**

```bash
npm run db:reset && npm run dev
```
