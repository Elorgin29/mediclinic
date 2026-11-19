# Dossier `database/diagrams` — Documentation de la base MediClinic

Ce dossier rassemble la **documentation de conception de la base de données** du projet
MediClinic, écrite selon la méthode **Merise** (démarche d'analyse et de conception des
systèmes d'information) et alignée sur les scripts SQL réellement exécutables du dossier
`database/migrations`.

> **Principe directeur.** La documentation ne remplace pas le code : elle l'explique.
> Les scripts SQL sont la source de vérité technique ; les documents de ce dossier en
> sont la lecture conceptuelle, logique, physique et métier.

---

## 1. Rôle du dossier

| Fichier | Objet | Public visé |
|---|---|---|
| [`README.md`](README.md) | Carte du dossier, méthode, ordre de lecture, conventions. | Tous |
| [`01_mcd.md`](01_mcd.md) | **Modèle Conceptuel de Données** : règles de gestion, entités, associations, cardinalités. | Concepteurs, correcteurs, chef de projet |
| [`02_mld.md`](02_mld.md) | **Modèle Logique de Données** : schéma relationnel, clés étrangères, index. | Développeurs back-end, DBA |
| [`03_mpd.md`](03_mpd.md) | **Modèle Physique de Données** : SGBD, types, triggers, vues, volumétrie. | DBA, DevOps, développeurs |
| [`04_dictionnaire_donnees.md`](04_dictionnaire_donnees.md) | **Dictionnaire de données** exhaustif : une ligne par colonne, contraintes, exemples. | Correcteurs, développeurs, équipe métier |
| [`../../docs/BCNF.md`](../../docs/BCNF.md) | **Analyse de normalisation** : dépendances fonctionnelles, 1FN → FNBC/BCNF, corrections du modèle initial. | Concepteurs, correcteurs |

Le dossier contient également, en amont, les scripts qui font foi :

| Script | Contenu |
|---|---|
| `database/migrations/001_init.sql` | Création de la base `mediclinic`, des **26 tables**, des index, des contraintes FK/CHECK et des **10 triggers** métier. |
| `database/migrations/002_views.sql` | Les **14 vues** SQL de dénormalisation en lecture. |
| `database/migrations/003_seed.sql` | Jeu de données de démonstration (53 utilisateurs, 30 patients, 50 rendez-vous, 25 factures, etc.). |

### Note de périmètre : 24 tables « métier », 26 tables physiques

Le schéma physique créé par `database/migrations/001_init.sql` compte **26 tables** :

- **24 tables du noyau applicatif** — périmètre annoncé dans le cahier des charges ;
- **2 tables du module optionnel « laboratoire »**, explicitement identifié comme bonus
  dans le script (`-- 9. LABORATOIRE (bonus)`) : `lab_tests` et `lab_requests`.

Les documents de ce dossier décrivent **les 26 tables**, y compris le module bonus ; les
chapitres indiquent systématiquement quand une table appartient au module optionnel. Le
[MCD](01_mcd.md) dénombre en outre **24 entités** auxquelles s'ajoutent **2 associations
N-N matérialisées en tables** (`user_roles`, `role_permissions`), soit bien 26 tables.

---

## 2. Méthode Merise employée

La démarche suivie est la démarche Merise « en trois modèles », complétée par le
dictionnaire de données et l'analyse de normalisation :

```
   Recueil des règles de gestion (RG-01 … RG-nn)
                    │
                    ▼
   ┌──────────────────────────────────────────┐
   │ MCD — Modèle Conceptuel de Données       │  01_mcd.md
   │ Entités, associations, cardinalités      │  (indépendant de tout SGBD)
   └──────────────────────────────────────────┘
                    │  Règles de passage MCD → MLD
                    ▼
   ┌──────────────────────────────────────────┐
   │ MLD — Modèle Logique de Données          │  02_mld.md
   │ Tables, clés primaires/étrangères, index │  (relationnel, encore générique)
   └──────────────────────────────────────────┘
                    │  Choix SGBD, types, triggers, vues
                    ▼
   ┌──────────────────────────────────────────┐
   │ MPD — Modèle Physique de Données         │  03_mpd.md
   │ MySQL 8.0 / InnoDB / utf8mb4             │  (implémentation réelle)
   └──────────────────────────────────────────┘
```

Deux documents complètent la démarche :

- le **dictionnaire de données** ([`04_dictionnaire_donnees.md`](04_dictionnaire_donnees.md))
  est le référentiel colonne par colonne, tenu à jour en parallèle du MPD ;
- l'**analyse de normalisation** ([`../../docs/BCNF.md`](../../docs/BCNF.md)) justifie
  formellement la décomposition des tables jusqu'à la forme normale de Boyce-Codd.

### Vocabulaire Merise utilisé dans ce dossier

| Terme | Définition retenue |
|---|---|
| **Entité** | Objet du domaine géré par l'organisation et porteur d'un identifiant (ex. `PATIENT`). |
| **Association** | Lien sémantique entre deux ou plusieurs entités (ex. `DISPOSE_DE` entre `UTILISATEUR` et `ROLE`). |
| **Cardinalité** | Nombre minimal et maximal d'occurrences de l'**autre** entité associées à une occurrence de l'entité considérée, noté `(min,max)`. |
| **Entité-association** | Association porteuse d'attributs et d'un identifiant propre, promue au rang d'entité (ex. `LIGNE_ORDONNANCE`). |
| **Identifiant** | Attribut (ou groupe d'attributs) qui distingue de façon unique chaque occurrence ; noté **souligné** dans les listes et `PK` dans les diagrammes. |
| **Association N-N** | Association dont les deux cardinalités maximales valent `N` : elle devient une **table de jointure** au passage au MLD. |

> **Lecture des cardinalités.** La cardinalité inscrite à côté d'une entité quantifie le
> nombre d'occurrences de **l'autre** entité liées à **une** occurrence de celle-ci.
> Exemple : `UTILISATEUR (1,N) —— (0,N) ROLE` se lit « un utilisateur possède de 1 à N
> rôles ; un rôle est porté par 0 à N utilisateurs ».

### Conventions de nommage

| Élément | Convention | Exemple |
|---|---|---|
| Tables | `snake_case`, au pluriel, en anglais technique | `prescription_items` |
| Colonnes | `snake_case`, singulier | `consultation_id` |
| Clé primaire | `id` (sauf tables de jointure : clé composite) | `roles.id` |
| Clé étrangère | `<entité_au_singulier>_id` | `doctor_id` |
| Contrainte d'unicité | `uq_<table>_<sujet>` | `uq_users_email` |
| Index secondaire | `idx_<table>_<sujet>` | `idx_appointments_doctor` |
| Clé étrangère (contrainte) | `fk_<table>_<cible>` | `fk_doctors_specialty` |
| Contrainte de domaine | `chk_<table>_<sujet>` | `chk_invoices_totals` |
| Trigger | `trg_<table>_<moment>_<événement>` | `trg_stock_movement_after_insert` |
| Vue | `v_<sujet>` | `v_appointment_details` |
| Identifiants du MCD | `MAJUSCULES_AVEC_UNDERSCORES` | `MOUVEMENT_STOCK` |

---

## 3. Comment lire les diagrammes Mermaid

Les six documents utilisent des blocs ` ```mermaid ` rendus par la plupart des
environnements Markdown modernes. Selon l'outil :

| Environnement | Rendu Mermaid |
|---|---|
| GitHub / GitLab (fichier `.md`) | Natif |
| VS Code | Extension **Markdown Preview Mermaid Support** |
| Typora, Obsidian | Natif |
| Éditeur en ligne | <https://mermaid.live> (copier-coller du bloc) |
| Terminal / visionneuse sans JS | Utiliser la **version ASCII/texte** fournie dans chaque document |

**Règles respectées par tous les blocs de ce dossier** (garantie de validité syntaxique) :

1. les **identifiants** d'entités et d'attributs Mermaid sont en `MAJUSCULES` ou
   `snake_case`, **sans accent ni espace** ;
2. les **libellés métier accentués** sont placés entre guillemets doubles (commentaires
   d'attributs et libellés de relations) ;
3. les types physiques sont écrits avec des underscores (`decimal_12_2`) car la syntaxe
   `erDiagram` de Mermaid n'accepte ni espace ni parenthèse dans un type ;
4. chaque document fournit une **lecture textuelle de secours** (tableaux et schéma ASCII).

### Correspondance des symboles de cardinalité

| Notation Merise | Symbole Mermaid | Signification |
|---|---|---|
| `(0,1)` | `\|o` | zéro ou un |
| `(1,1)` | `\|\|` | exactement un |
| `(0,N)` | `}o` | zéro ou plusieurs |
| `(1,N)` | `}\|` | un ou plusieurs |

Dans une relation Mermaid `A <gauche>--<droite> B`, le symbole **gauche** décrit le
nombre de `A` par `B` et le symbole **droite** le nombre de `B` par `A`. Le tableau des
associations de [`01_mcd.md`](01_mcd.md) donne systématiquement les deux notations.

---

## 4. Ordre de lecture conseillé

### Parcours « compréhension métier » (30 minutes)

1. [`01_mcd.md`](01_mcd.md) §1 — les règles de gestion recueillies auprès de la clinique.
2. [`01_mcd.md`](01_mcd.md) §2 et §3 — entités et associations, avec le diagramme MCD.
3. [`01_mcd.md`](01_mcd.md) §5 — justification des choix conceptuels.
4. [`04_dictionnaire_donnees.md`](04_dictionnaire_donnees.md) — pour retrouver le sens
   exact d'une colonne et un exemple de valeur.

### Parcours « développement » (1 heure)

1. [`02_mld.md`](02_mld.md) §2 — schéma relationnel `table(#clé, attributs, *FK*)`.
2. [`02_mld.md`](02_mld.md) §4 — tableau des clés étrangères et règles `ON DELETE` /
   `ON UPDATE`, indispensable avant d'écrire une requête de suppression.
3. [`02_mld.md`](02_mld.md) §5 — index disponibles : à consulter avant toute
   optimisation de requête.
4. [`03_mpd.md`](03_mpd.md) §5 et §6 — triggers et vues : ils modifient le comportement
   des écritures et constituent le contrat de lecture de l'API.
5. [`04_dictionnaire_donnees.md`](04_dictionnaire_donnees.md) — valeurs d'`ENUM` et
   colonnes obligatoires avant d'écrire un `INSERT`.

### Parcours « validation académique » (1 h 30)

1. [`01_mcd.md`](01_mcd.md) en entier — cohérence règles de gestion ↔ modèle.
2. [`../../docs/BCNF.md`](../../docs/BCNF.md) en entier — normalisation et corrections
   volontaires du modèle initial.
3. [`03_mpd.md`](03_mpd.md) §2 à §4 — justification des types, des contraintes et de la
   volumétrie.
4. [`04_dictionnaire_donnees.md`](04_dictionnaire_donnees.md) §28 — concordance des
   énumérations avec `packages/shared/src/constants.ts`.

### Parcours « exploitation / DBA »

1. [`03_mpd.md`](03_mpd.md) §1 — SGBD, moteur, collation.
2. [`03_mpd.md`](03_mpd.md) §5 — triggers métier et risques de contention.
3. [`03_mpd.md`](03_mpd.md) §7 — volumétrie à 3 ans, index et partitionnement.
4. [`02_mld.md`](02_mld.md) §4 — règles de suppression en cascade à connaître avant
   toute opération de purge.

---

## 5. Règles de maintenance de cette documentation

1. **Toute évolution du schéma** (nouvelle table, nouvelle colonne, changement de type,
   trigger, vue) doit être répercutée **dans le même lot** sur : le script
   `database/migrations/00x_*.sql` concerné, le [MLD](02_mld.md), le [MPD](03_mpd.md) et
   le [dictionnaire de données](04_dictionnaire_donnees.md).
2. **Toute nouvelle valeur d'énumération** doit être ajoutée simultanément dans le
   script SQL, dans `packages/shared/src/constants.ts` et dans le §28 du
   [dictionnaire de données](04_dictionnaire_donnees.md).
3. **Toute nouvelle règle de gestion** reçoit un identifiant `RG-nn` et est référencée
   dans le [MCD](01_mcd.md), qui reste le document de référence fonctionnel.
4. **Aucune modification « sauvage »** : la base de production est créée uniquement à
   partir des scripts de `database/migrations`, jamais par une modification manuelle.

---

## 6. Correspondance rapide entre documents

| Question | Document | Section |
|---|---|---|
| Quelle règle métier justifie cette table ? | [01_mcd.md](01_mcd.md) | §1, §3 |
| Pourquoi deux tables `users` et `patients` ? | [01_mcd.md](01_mcd.md) | §5.2 |
| Comment se traduit une association N-N ? | [02_mld.md](02_mld.md) | §1 |
| Que se passe-t-il si je supprime un patient ? | [02_mld.md](02_mld.md) | §4 |
| Quel index sert à l'agenda du médecin ? | [02_mld.md](02_mld.md) | §5 (`idx_appointments_doctor`) |
| Quel type SQL exact pour `consultation_fee` ? | [03_mpd.md](03_mpd.md) | §3 (`doctors`) |
| Comment le stock est-il mis à jour ? | [03_mpd.md](03_mpd.md) | §5.1 |
| Qui consomme la vue `v_low_stock_medications` ? | [03_mpd.md](03_mpd.md) | §6 |
| Quelles valeurs peut prendre `invoices.status` ? | [04_dictionnaire_donnees.md](04_dictionnaire_donnees.md) | §18 et §28 |
| Cette table est-elle en BCNF ? | [../../docs/BCNF.md](../../docs/BCNF.md) | §4, §7 |

---

*Documentation MediClinic — dossier `database/diagrams`, à maintenir avec les scripts de
`database/migrations`.*
