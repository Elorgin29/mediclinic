# Analyse de normalisation — MediClinic

**Dépendances fonctionnelles, formes normales et justification de la BCNF**

> **Fichiers SQL de référence** : `database/migrations/001_init.sql` (schéma réel),
> `database/migrations/003_seed.sql` (jeu de données).
> **Documents liés** : [`database/diagrams/01_mcd.md`](../database/diagrams/01_mcd.md) ·
> [`02_mld.md`](../database/diagrams/02_mld.md) ·
> [`03_mpd.md`](../database/diagrams/03_mpd.md) ·
> [`04_dictionnaire_donnees.md`](../database/diagrams/04_dictionnaire_donnees.md).

Ce document analyse la normalisation du schéma MediClinic. Il définit les notions
utilisées, présente l'ensemble des dépendances fonctionnelles (DF) issues du cahier des
charges, justifie la forme normale atteinte par **chacune des 26 tables**, documente
**deux corrections volontaires** apportées au modèle initial, puis démontre que les
**colonnes dérivées conservées** ne violent pas la forme normale de Boyce-Codd (BCNF).

---

## 1. Objet et démarche

### 1.1 Objet

La normalisation poursuit un objectif unique : **stocker chaque fait une seule fois**, de
sorte qu'aucune anomalie de mise à jour, d'insertion ou de suppression ne puisse
apparaître. Elle se conduit par l'analyse des **dépendances fonctionnelles** entre
attributs, indépendamment de toute considération de performance.

### 1.2 Démarche suivie

| Étape | Contenu | Section |
|---|---|---|
| 1 | Définitions formelles (DF, dépendances partielles et transitives, 1FN → BCNF) | §2 |
| 2 | Recensement des dépendances fonctionnelles issues des règles de gestion | §3 |
| 3 | Vérification des formes normales, table par table, avec preuve | §4 |
| 4 | Corrections volontaires du modèle initial du cahier des charges | §5 |
| 5 | Justification des colonnes dérivées conservées | §6 |
| 6 | Synthèse : table → forme normale → anomalie évitée | §7 |

### 1.3 Notations

| Notation | Signification |
|---|---|
| `R(A, B, C)` | Relation (table) `R` dont les attributs sont `A`, `B`, `C` |
| `X → Y` | Dépendance fonctionnelle : `X` détermine `Y` (à une valeur de `X` correspond au plus une valeur de `Y`) |
| `X ↛ Y` | Aucune dépendance fonctionnelle de `X` vers `Y` |
| `X, Y → Z` | Dépendance fonctionnelle **composite** (le couple détermine `Z`) |
| `K` | Clé candidate : sous-ensemble minimal d'attributs déterminant tous les autres |
| `CK` | Clé candidate (*candidate key*), `PK` clé primaire (clé candidate choisie) |
| `SK` | Super-clé : tout sur-ensemble d'une clé candidate |
| `¬` | Négation logique |

---

## 2. Définitions

### 2.1 Dépendance fonctionnelle (DF)

Soit `R(X1, …, Xn)` une relation et `X`, `Y` deux sous-ensembles de ses attributs. On dit
que **`X → Y`** (« `X` détermine `Y` ») si, et seulement si, pour toute paire de tuples
`t1`, `t2` de `R` :

```
t1[X] = t2[X]  ⟹  t1[Y] = t2[Y]
```

Autrement dit : deux lignes qui partagent la même valeur de `X` partagent nécessairement
la même valeur de `Y`. La DF est une **contrainte sémantique** issue des règles de gestion :
elle ne se prouve pas par l'observation des données (un jeu de données peut la vérifier
par hasard), elle se déclare.

| Terme | Définition |
|---|---|
| **DF triviale** | `X → Y` où `Y ⊆ X`. Elle est toujours vraie et sans intérêt pour la normalisation. |
| **DF élémentaire** | DF non triviale dont le déterminant `X` est minimal : aucun attribut de `X` ne peut être retiré sans perdre la DF. |
| **Dépendance partielle** | DF `X → Y` où `X` est **composite** et où un sous-ensemble **strict** de `X` détermine déjà `Y` (il existe `X' ⊂ X` avec `X' → Y`). |
| **Dépendance transitive** | Chaîne `X → Y` et `Y → Z` où `Y` n'est **pas** une clé candidate de `R` (et `Y ⊄ X`, `Z ⊄ Y`). |
| **Dépendance multivaluée** | `X ↠ Y` : à une valeur de `X` correspond un **ensemble** de valeurs de `Y`, indépendamment des autres attributs (fondement de la 4FN, hors périmètre : aucune n'est retenue dans ce schéma). |

### 2.2 Première forme normale (1FN)

> Une relation est en **1FN** si et seulement si tous ses attributs sont **atomiques** :
> aucune colonne ne contient une liste de valeurs, un groupe répétitif ou une valeur
> composite exploitable comme plusieurs données.

**Violations typiques** : une colonne `telephones` contenant `"0340000011, 0340000012"` ;
une colonne `roles` contenant `"DOCTOR,ADMIN"` ; des colonnes répétitives
`medicament1, medicament2, medicament3` dans une ordonnance.

### 2.3 Deuxième forme normale (2FN)

> Une relation est en **2FN** si et seulement si elle est en **1FN** et si **tout attribut
> non premier dépend de la totalité** de chaque clé candidate, et non d'une partie de
> celle-ci (absence de dépendance partielle). Une relation dont toutes les clés candidates
> sont réduites à un seul attribut est donc **toujours en 2FN**.

**Violation typique** : `LIGNE(id_commande, id_produit, libelle_produit, quantite)` avec la
DF `id_produit → libelle_produit` : le libellé ne dépend que d'une partie de la clé.

### 2.4 Troisième forme normale (3FN)

> Une relation est en **3FN** si et seulement si elle est en **2FN** et si **aucun attribut
> non premier ne dépend transitivement** d'une clé candidate : pour toute DF non triviale
> `X → Y`, soit `X` est une super-clé, soit `Y` est un attribut premier (appartenant à une
> clé candidate).

**Violation typique** : `PATIENT(id, code_postal, ville)` avec `code_postal → ville` alors
que `code_postal` n'est pas une clé : la ville dépend transitivement de `id` par
l'intermédiaire du code postal.

### 2.5 Forme normale de Boyce-Codd (FNBC / BCNF)

> Une relation est en **BCNF** si et seulement si, pour **toute** dépendance fonctionnelle
> non triviale `X → Y` définie sur elle, `X` est une **super-clé**.

La BCNF renforce la 3FN : elle ne tolère plus l'exception « `Y` attribut premier ». Toute
relation en BCNF est en 3FN (donc en 2FN et en 1FN) ; la réciproque est fausse.

**Violation typique** : `ENSEIGNEMENT(etudiant, matiere, enseignant)` avec
`matiere → enseignant` : `matiere` n'est pas une super-clé, donc la relation n'est ni en
3FN ni en BCNF.

### 2.6 Pourquoi viser la BCNF ?

| Objectif | Anomalie évitée |
|---|---|
| **Une information à un seul endroit** | Anomalie de **mise à jour** : deux copies d'une même information divergentes. |
| **Insertion possible sans donnée fictive** | Anomalie d'**insertion** : impossibilité d'insérer un fait sans inventer un autre fait. |
| **Suppression sans perte d'information** | Anomalie de **suppression** : la suppression d'un fait détruit un autre fait indépendant. |
| **Décomposition sans perte** | Toute décomposition en BCNF préserve l'information (jointure sans perte) ; la préservation des DF n'est en revanche pas garantie — ce schéma la préserve, les DF étant portées par des contraintes déclaratives. |

---

## 3. Recensement des dépendances fonctionnelles

### 3.1 Méthode

Les DF ont été recensées **à partir des règles de gestion** documentées en
[`database/diagrams/01_mcd.md`](../database/diagrams/01_mcd.md) §1.3 (RG-01 à RG-37), puis
confrontées au schéma initial du cahier des charges. La méthode appliquée est la suivante :

1. **Énumérer les identifiants métier** : pour chaque entité, quels attributs (ou couples
   d'attributs) désignent une occurrence de manière unique ? (ex. `users.email`,
   `doctors.license_number`, `medications.(name, unit)`).
2. **Énumérer les dépendances de regroupement** : quelles informations sont
   *intrinsèquement liées* à cet identifiant ? (ex. la spécialité appartient au médecin, la
   classe thérapeutique appartient à la référence du catalogue).
3. **Détecter les dépendances partielles** : lorsqu'une clé est composite, chaque attribut
   dépend-il de la **totalité** de la clé ou seulement d'une partie ?
4. **Détecter les dépendances transitives** : un attribut non clé en détermine-t-il un
   autre ?
5. **Décomposer** jusqu'à ce que tout déterminant non trivial soit une super-clé.

### 3.2 Dépendances fonctionnelles du schéma initial du cahier des charges

Le cahier des charges proposait initialement notamment `users.role_id` et
`consultations.prescription_id`. Les DF retenues sur ce modèle initial sont les suivantes
(les deux lignes en gras sont celles qui ont conduit à une correction, détaillée en §5) :

| Relation initiale | Dépendances fonctionnelles | Origine (règle de gestion) | Verdict |
|---|---|---|---|
| `UTILISATEUR(id, email, password_hash, first_name, last_name, phone, is_active, last_login_at, **role_id**)` | `id →` tous ; `email → id` ; `role_id → role_code, role_name` | RG-01 (compte unique par e-mail), RG-02 (un compte peut porter plusieurs rôles) | **Défaut** : `role_id` interdit la cardinalité N-N → voir §5.1 |
| `PATIENT(id, ..., **user_id**)` | `id →` tous ; `user_id → id` (si renseigné) | RG-07 (dossier sans compte possible) | Conforme |
| `MEDECIN(id, user_id, specialty_id, license_number, consultation_fee, …)` | `id →` tous ; `user_id → id` ; `license_number → id` | RG-09 (un profil par compte, numéro d'ordre unique) | Conforme |
| `RENDEZ_VOUS(id, patient_id, doctor_id, scheduled_at, …)` | `id →` tous | RG-13 | Conforme |
| `CONSULTATION(id, appointment_id, doctor_id, diagnosis, notes, follow_up_at, **prescription_id**)` | `id →` tous ; `appointment_id → id` ; **`id → prescription_id`** et **`PRESCRIPTION.consultation_id → CONSULTATION.id`** | RG-16, RG-18 | **Défaut** : bijection réciproque redondante et cardinalité 1-N interdite → voir §5.2 |
| `ORDONNANCE(id, consultation_id, doctor_id, issued_at, status)` | `id →` tous | RG-18 | Conforme |
| `MEDICAMENT(id, name, unit, category, price, …)` | `id →` tous ; `(name, unit) → id` | RG-21 (référence identifiée par nom + conditionnement) | Conforme |
| `FACTURE(id, number, patient_id, subtotal, vat_rate, vat_amount, total_amount, paid_amount, …)` | `id →` tous ; `number → id` ; `id → subtotal, vat_amount, total_amount, paid_amount` | RG-26 à RG-31 | Conforme (colonnes dérivées, §6) |

### 3.3 DF conservées dans le schéma final

| # | Relation | Dépendances fonctionnelles retenues | Commentaire |
|---|---|---|---|
| DF-01 | `roles` | `id →` tous ; `code → id` ; `name → id` | `code` et `name` sont des identifiants métier |
| DF-02 | `permissions` | `id →` tous ; `code → id` | `code` (`ressource:action`) est l'identifiant métier |
| DF-03 | `role_permissions` | *aucune DF non triviale* (tous les attributs sont dans la clé) | Table de jointure pure |
| DF-04 | `users` | `id →` tous ; `email → id` | `email` est l'identifiant de connexion |
| DF-05 | `user_roles` | `user_id, role_id → created_at` | La date d'attribution dépend du **couple** |
| DF-06 | `refresh_tokens` | `id →` tous ; `token_hash → id` | L'empreinte identifie le jeton |
| DF-07 | `patients` | `id →` tous ; `user_id → id` (si non nul) ; `insurance_number → id` (si non nul) | Deux identifiants métier facultatifs |
| DF-08 | `specialties` | `id →` tous ; `name → id` | Référentiel |
| DF-09 | `departments` | `id →` tous ; `name → id` | Référentiel |
| DF-10 | `doctors` | `id →` tous ; `user_id → id` ; `license_number → id` | Profil 1-1 avec le compte |
| DF-11 | `appointments` | `id →` tous | Une DF métier `(doctor_id, scheduled_at)` n'est **pas** retenue (créneaux simultanés possibles sur deux salles) |
| DF-12 | `consultations` | `id →` tous ; `appointment_id → id` | Relation 1-1 avec le rendez-vous |
| DF-13 | `prescriptions` | `id →` tous | Plusieurs ordonnances par consultation |
| DF-14 | `medications` | `id →` tous ; `(name, unit) → id` | `name` seul **ne détermine pas** `category` → voir §4.14 |
| DF-15 | `prescription_items` | `id →` tous | `(prescription_id, medication_id)` n'est pas unique (bis) |
| DF-16 | `stock_movements` | `id →` tous | Journal append-only |
| DF-17 | `invoices` | `id →` tous ; `number → id` ; `id → subtotal, vat_amount, total_amount, paid_amount` | Colonnes dérivées (§6) |
| DF-18 | `invoice_items` | `id →` tous ; `quantity, unit_price → line_total` | `line_total` est une **colonne générée** (§6.4) |
| DF-19 | `payments` | `id →` tous | Encaisssements multiples par facture |
| DF-20 | `shifts` | `id →` tous | Une DF `(doctor_id, start_at)` n'est pas retenue (chevauchements contrôlés applicativement) |
| DF-21 | `meetings` | `id →` tous ; `appointment_id → id` (si non nul) | Au plus une téléconsultation par rendez-vous |
| DF-22 | `lab_tests` | `id →` tous ; `name → id` | Référentiel *(module bonus)* |
| DF-23 | `lab_requests` | `id →` tous | Plusieurs demandes par patient |
| DF-24 | `audit_logs` | `id →` tous | Journal append-only |
| DF-25 | `notifications` | `id →` tous | Aucune DF métier supplémentaire |
| DF-26 | `clinic_settings` | `id →` tous, avec `id` contraint à la valeur 1 | Table singleton |

---

## 4. Vérification table par table

Pour chaque table : les DF retenues, la forme normale atteinte et la **preuve**. La preuve
consiste à montrer que **tout déterminant d'une DF non triviale est une super-clé**, ce qui
établit simultanément la 2FN, la 3FN et la BCNF (la BCNF impliquant les précédentes).

### 4.1 `roles`

**DF** : `id →` tous ; `code → id` ; `name → id`.

**Clés candidates** : `{id}`, `{code}`, `{name}` (les deux dernières adossées à
`uq_roles_code` et `uq_roles_name`).

**Preuve** : tout attribut non clé (`name`, `description`, `is_system`, `created_at`,
`updated_at`) dépend de la clé primaire `id`, qui est une clé candidate donc une super-clé.
Les deux autres DF non triviales (`code → …`, `name → …`) ont également pour déterminant
une clé candidate. Aucune dépendance partielle (clés à un seul attribut), aucune
dépendance transitive (il n'existe aucun attribut non clé déterminant un autre attribut).

**Forme atteinte : BCNF.** *Anomalie évitée* : un même code de rôle ne peut exister deux
fois avec deux libellés différents (incohérence du menu d'habilitations).

### 4.2 `permissions`

**DF** : `id →` tous ; `code → id`.

**Clés candidates** : `{id}`, `{code}`.

**Preuve** : `resource` et `action` constituent une décomposition informative de `code`
(`code = resource || ':' || action`), mais **aucune DF** `resource, action → code` n'est
déclarée ni garantie : deux permissions distinctes peuvent partager le même couple
(ex. `prescription:manage` et `stock:manage` ont des ressources différentes, mais rien
n'interdit à terme deux permissions de même ressource et même action avec des codes
distincts). En l'absence de cette DF, tout déterminant est une clé candidate.

**Forme atteinte : BCNF.** *Anomalie évitée* : un code de permission dupliqué avec des
libellés divergents entre l'API et l'interface.

> **Point d'attention.** Si la clinique décidait un jour que le couple `(resource, action)`
> identifie la permission, il faudrait ajouter `UNIQUE (resource, action)` ; la relation
> resterait en BCNF puisqu'un nouveau déterminant serait une clé candidate.

### 4.3 `role_permissions`

**DF** : aucune DF non triviale — la relation ne possède que `role_id` et `permission_id`,
qui forment ensemble la clé primaire.

**Clé candidate** : `{role_id, permission_id}` (unique).

**Preuve** : l'unique DF exprimable est `role_id, permission_id → role_id, permission_id`,
triviale. Il n'existe aucun attribut hors clé, donc aucune dépendance partielle ni
transitive possible.

**Forme atteinte : BCNF** (et même 4FN, la relation étant binaire et sans attribut hors clé).
*Anomalie évitée* : l'attribution d'une permission à un rôle ne peut pas être stockée deux
fois, ni dissociée du couple qu'elle concerne.

### 4.4 `users`

**DF** : `id →` tous ; `email → id`.

**Clés candidates** : `{id}`, `{email}` (adossée à `uq_users_email`).

**Preuve** : `first_name`, `last_name`, `phone`, `password_hash`, `is_active`,
`last_login_at`, `created_at`, `updated_at` dépendent de `id` ; `email` étant unique, elle
détermine elle aussi tous les attributs. Aucun attribut non clé ne détermine un autre
attribut non clé : `last_name` ne détermine pas `first_name` (homonymes), `phone` n'est pas
unique.

**Forme atteinte : BCNF.** *Anomalie évitée* : deux comptes ne peuvent partager la même
adresse de connexion, ce qui empêcherait toute authentification non ambiguë.

> **Rappel de la correction (§5.1)** : la colonne `role_id` du modèle initial a été
> retirée ; sans quoi cette relation n'aurait pas été en BCNF dès qu'un compte cumule
> plusieurs rôles.

### 4.5 `user_roles`

**DF** : `user_id, role_id → created_at`.

**Clé candidate** : `{user_id, role_id}` (clé primaire composite).

**Preuve** : `created_at` est la **date d'attribution du rôle au compte**. Elle dépend du
**couple** : elle ne dépend ni de `user_id` seul (un même utilisateur peut recevoir deux
rôles à des dates différentes), ni de `role_id` seul (un même rôle est attribué à des dates
différentes selon les comptes). Il n'y a donc **aucune dépendance partielle** : la 2FN est
satisfaite. Aucun attribut non clé ne détermine un autre attribut : la 3FN est satisfaite.
Le seul déterminant non trivial est la clé primaire, donc une super-clé.

**Forme atteinte : BCNF.** *Anomalie évitée* : la date d'attribution ne peut pas être
stockée deux fois de façon divergente, et elle ne peut pas être perdue lors de la
suppression d'un rôle (`ON DELETE CASCADE` supprime la ligne d'attribution, ce qui est le
comportement voulu).

### 4.6 `refresh_tokens`

**DF** : `id →` tous ; `token_hash → id`.

**Clés candidates** : `{id}`, `{token_hash}`.

**Preuve** : `expires_at`, `revoked_at`, `user_agent`, `ip_address` et `user_id` dépendent
du jeton identifié par `id` (ou par son empreinte). Aucune dépendance partielle
(clés simples), aucune dépendance transitive (`user_agent` ne détermine pas `ip_address`).

**Forme atteinte : BCNF.** *Anomalie évitée* : une empreinte de jeton ne peut exister deux
fois, ce qui rendrait la révocation ambiguë et ouvrirait une faille de sécurité.

### 4.7 `patients`

**DF** : `id →` tous ; `user_id → id` (lorsque `user_id` est renseigné) ;
`insurance_number → id` (lorsqu'il est renseigné).

**Clé candidate** : `{id}`. Les colonnes `user_id` et `insurance_number` sont **uniques mais
nullables** : elles se comportent comme des clés candidates sur le sous-ensemble des tuples
où elles sont renseignées.

**Preuve** : toutes les données administratives et médicales (`birth_date`, `gender`,
`blood_group`, `allergies`, `medical_history`, coordonnées, contacts d'urgence) dépendent du
**dossier** identifié par `id`. Aucun de ces attributs n'en détermine un autre : deux
patients peuvent partager la même date de naissance, le même groupe sanguin ou la même
ville. Aucune dépendance partielle (clé simple), aucune dépendance transitive.

**Forme atteinte : BCNF.** *Anomalie évitée* : un même numéro d'assurance ne peut désigner
deux dossiers (fraude ou erreur de saisie), et un compte ne peut être relié qu'à un seul
dossier.

> **Point d'attention — le bloc d'adresse.** Aucune DF `postal_code → city` n'est retenue,
> et ce pour deux raisons : (1) la clinique n'est pas un référentiel d'adresses, elle
> reproduit l'adresse déclarée par le patient, qui peut comporter des cas particuliers
> (lieu-dit, adresse étrangère, erreur tolérée) ; (2) dans le jeu de démonstration, `city`
> et `postal_code` sont générés indépendamment (`database/migrations/003_seed.sql`,
> lignes 411-413), ce qui produit des couples ville/code postal non cohérents — le schéma
> n'en tire aucune conclusion. Si la clinique décidait d'adosser les adresses à un
> référentiel postal, il faudrait créer une relation `cities(postal_code, city)` **et**
> retirer `city` de `patients`, sinon une dépendance transitive apparaîtrait
> (`id → postal_code → city`), plaçant `patients` en violation de la 3FN. Ce choix est
> documenté ici pour montrer qu'il est **délibéré** et non subi.

### 4.8 `specialties`

**DF** : `id →` tous ; `name → id`.

**Clés candidates** : `{id}`, `{name}`.

**Preuve** : `description`, `created_at` et `updated_at` dépendent de la spécialité
identifiée par `id` ou par son nom unique. Aucun attribut non clé déterminant.

**Forme atteinte : BCNF.** *Anomalie évitée* : deux lignes « Cardiologie » avec des
descriptions différentes.

### 4.9 `departments`

**DF** : `id →` tous ; `name → id`.

**Clés candidates** : `{id}`, `{name}`.

**Preuve** : `head_doctor_id` (médecin chef) et `description` dépendent du département.
Aucune DF `head_doctor_id → id` : un médecin pourrait, au niveau du schéma, être chef de
plusieurs départements — la règle métier (RG-11 : au plus un chef par département) porte sur
le **département**, pas sur le médecin, et elle est satisfaite par la cardinalité `(0,1)`
côté département.

**Forme atteinte : BCNF.** *Anomalie évitée* : un département ne peut pas être dupliqué sous
deux noms.

### 4.10 `doctors`

**DF** : `id →` tous ; `user_id → id` ; `license_number → id`.

**Clés candidates** : `{id}`, `{user_id}` (adossée à `uq_doctors_user`),
`{license_number}` (adossée à `uq_doctors_license`).

**Preuve** : `specialty_id`, `department_id`, `consultation_fee`, `bio`,
`is_accepting_patients` dépendent du médecin. Aucun de ces attributs non clés n'en détermine
un autre.

> **Point d'attention essentiel — `specialty_id ↛ consultation_fee`.** Dans le jeu de
> démonstration, chaque spécialité ne compte qu'un médecin : observer les données
> suggérerait à tort la DF `specialty_id → consultation_fee`. Or la règle de gestion RG-09
> stipule que **le tarif est fixé par praticien** (deux cardiologues peuvent facturer
> 70 € et 80 €). Une dépendance fonctionnelle est une **contrainte sémantique** : elle se
> déclare d'après la règle métier, jamais d'après l'échantillon. La DF est donc rejetée et
> `consultation_fee` reste un attribut de `doctors`.

**Forme atteinte : BCNF.** *Anomalie évitée* : un même numéro d'ordre ne peut être associé à
deux profils ; un compte ne peut porter deux profils médecins.

### 4.11 `appointments`

**DF** : `id →` tous.

**Clé candidate** : `{id}`.

**Preuve** : `patient_id`, `doctor_id`, `department_id`, `scheduled_at`, `duration`,
`status`, `type`, `reason`, `notes`, `cancelled_reason`, `created_by` dépendent du
rendez-vous. La DF `doctor_id, scheduled_at → id` **n'est pas retenue** : rien n'interdit
deux rendez-vous simultanés pour un même médecin dans deux salles ou en présentiel et en
téléconsultation ; le contrôle des chevauchements relève de la logique applicative et non
d'une contrainte d'unicité (choix documenté : une contrainte d'unicité empêcherait les
créneaux multi-salles).

**Forme atteinte : BCNF.** *Anomalie évitée* : aucune redondance d'attribut ; le statut et
le type sont portés une seule fois par rendez-vous.

### 4.12 `consultations`

**DF** : `id →` tous ; `appointment_id → id`.

**Clés candidates** : `{id}`, `{appointment_id}` (adossée à
`uq_consultations_appointment`).

**Preuve** : `diagnosis`, `notes`, `follow_up_at`, `doctor_id` dépendent de la consultation.
L'unicité de `appointment_id` traduit la relation 1-1 : un rendez-vous ne produit qu'une
consultation. Aucune dépendance partielle (clés simples), aucune dépendance transitive :
`doctor_id` ne détermine pas `diagnosis` (un même médecin pose des diagnostics différents).

**Forme atteinte : BCNF.** *Anomalie évitée* : un même rendez-vous ne peut donner lieu à
deux comptes rendus contradictoires.

> **Rappel de la correction (§5.2)** : la colonne `prescription_id` du modèle initial a été
> retirée, ce qui supprime la dépendance réciproque redondante avec
> `prescriptions.consultation_id` et rétablit la cardinalité réelle 1-N.

### 4.13 `prescriptions`

**DF** : `id →` tous.

**Clé candidate** : `{id}`.

**Preuve** : `consultation_id`, `doctor_id`, `issued_at`, `status` dépendent de
l'ordonnance. `consultation_id` **n'est pas unique** (une consultation peut produire
plusieurs ordonnances : ordonnance initiale puis renouvellement), il ne peut donc pas être
déterminant. Aucun attribut non clé ne détermine un autre attribut non clé.

**Forme atteinte : BCNF.** *Anomalie évitée* : le statut (`ISSUED`, `DISPENSED`,
`CANCELLED`) n'est stocké qu'une fois par ordonnance.

### 4.14 `medications`

**DF** : `id →` tous ; `(name, unit) → id`.

**Clés candidates** : `{id}`, `{name, unit}` (adossée à `uq_medications_name_unit`).

**Preuve** : `category`, `price`, `stock_quantity`, `alert_threshold`, `expiry_date`,
`supplier` dépendent de la référence (le couple nom + conditionnement).
`stock_quantity` est de plus maintenu par trigger (§6.3). Aucune dépendance partielle :
`name` seul ne détermine pas les attributs (un même nom peut exister en comprimé et en
flacon, avec des prix différents) ; `unit` seul ne détermine rien.

> **Point d'attention — `name ↛ category`.** Intuitivement, le nom d'un médicament semble
> impliquer sa classe thérapeutique. Ce n'est pas le cas au niveau de granularité retenu :
> un même nom peut appartenir à des classes différentes selon la dose ou la forme
> (l'acide acétylsalicylique est **antalgique** à dose élevée et **antiagrégant
> plaquettaire** à faible dose). La classe est donc portée par la **référence**, non par le
> nom. Si la clinique décidait un jour l'inverse, il faudrait extraire une relation
> `medication_names(name, category)` — l'actuelle relation `medications` **violerait alors
> la BCNF**, car `name` ne serait pas une super-clé. Ce cas limite est explicitement
> documenté pour montrer que l'absence de cette DF est un **choix argumenté**.

**Forme atteinte : BCNF.** *Anomalie évitée* : deux lignes portant le même couple
nom/conditionnement avec des prix divergents.

### 4.15 `prescription_items`

**DF** : `id →` tous.

**Clé candidate** : `{id}`.

**Preuve** : `dosage`, `frequency`, `duration`, `instructions`, `quantity` dépendent de la
ligne. Le couple `(prescription_id, medication_id)` **n'est volontairement pas unique** : une
même ordonnance peut prescrire deux fois le même médicament (posologie du matin et du soir,
ou deux durées distinctes). Ce couple ne peut donc pas être déterminant — et il n'y a aucune
raison qu'il le soit, l'identifiant propre `id` jouant ce rôle.

**Forme atteinte : BCNF.** *Anomalie évitée* : l'impossibilité de prescrire deux fois le
même médicament, qui aurait été la conséquence d'une clé primaire composite
`(prescription_id, medication_id)`.

### 4.16 `stock_movements`

**DF** : `id →` tous.

**Clé candidate** : `{id}`.

**Preuve** : `medication_id`, `type`, `quantity`, `reason`, `user_id`, `created_at`
dépendent du mouvement. Aucune DF `(medication_id, created_at) → id` : deux mouvements
peuvent partager la même minute (réception de plusieurs lots). Aucun attribut non clé
déterminant un autre.

**Forme atteinte : BCNF.** *Anomalie évitée* : un mouvement ne peut pas être dupliqué ni
perdre son imputation nominative.

### 4.17 `invoices`

**DF** : `id →` tous ; `number → id` ; `id → subtotal, vat_amount, total_amount,
paid_amount` (colonnes dérivées, cf. §6).

**Clés candidates** : `{id}`, `{number}`.

**Preuve** : `patient_id`, `consultation_id`, `vat_rate`, `status`, `issued_at`,
`due_date`, `created_by` dépendent de la facture identifiée par `id` ou par son numéro
unique. Les montants dérivés sont déterminés par la **clé elle-même** (`id → subtotal`), et
non par un attribut non clé : il n'y a donc aucune dépendance transitive de la forme
`id → vat_rate → vat_amount` — la TVA est calculée à partir du taux, mais le taux n'est pas
un déterminant *suffisant* du montant (il faut aussi le sous-total). La dépendance réelle
`subtotal, vat_rate → vat_amount` a pour déterminant un ensemble qui contient la clé, donc
une super-clé.

**Forme atteinte : BCNF.** *Anomalie évitée* : deux factures partageant le même numéro
légal ; incohérence entre le taux de TVA et les montants affichés (garantie par le trigger
`trg_invoice_before_update`).

### 4.18 `invoice_items`

**DF** : `id →` tous ; `quantity, unit_price → line_total`.

**Clé candidate** : `{id}`.

**Preuve** : `label`, `quantity`, `unit_price` dépendent de la ligne. La DF
`quantity, unit_price → line_total` a un déterminant qui n'est **pas** une super-clé — mais
`line_total` est une **colonne générée `STORED`**, non inscriptible : elle ne constitue pas
un fait stocké indépendant, mais une **expression dérivée** évaluée par le SGBD. La
relation *réellement stockée* est `R'(id, invoice_id, label, quantity, unit_price)`, qui est
en BCNF (seul déterminant : `id`). La démonstration complète figure en §6.4.

**Forme atteinte : BCNF** (la colonne dérivée étant hors du schéma des faits stockés).
*Anomalie évitée* : un total de ligne incohérent avec la quantité et le prix unitaire
(impossible par construction).

### 4.19 `payments`

**DF** : `id →` tous.

**Clé candidate** : `{id}`.

**Preuve** : `invoice_id`, `amount`, `method`, `paid_at`, `reference`, `recorded_by`
dépendent de l'encaissement. Aucune DF `invoice_id → paid_amount` n'existe **dans cette
relation** : le montant payé est un agrégat stocké dans `invoices` (§6.2). Aucun attribut
non clé déterminant.

**Forme atteinte : BCNF.** *Anomalie évitée* : un encaissement ne peut pas être enregistré
deux fois (double comptage de la recette).

### 4.20 `shifts`

**DF** : `id →` tous.

**Clé candidate** : `{id}`.

**Preuve** : `doctor_id`, `department_id`, `start_at`, `end_at`, `type`, `status`, `notes`,
`created_by` dépendent de la garde. Le couple `(doctor_id, start_at)` n'est pas déclaré
unique : un médecin peut assurer une garde partagée entre deux services au même instant, et
la détection des chevauchements relève du contrôle applicatif (RG-32).

**Forme atteinte : BCNF.** *Anomalie évitée* : aucune duplication d'attribut.

### 4.21 `meetings`

**DF** : `id →` tous ; `appointment_id → id` (lorsqu'il est renseigné).

**Clé candidate** : `{id}` ; `{appointment_id}` est une clé candidate sur les tuples
renseignés (unicité nullable).

**Preuve** : `patient_id`, `doctor_id`, `reason`, `preferred_at`, `duration`, les
identifiants et liens Zoom, `status`, `rejection_reason`, `requested_by`, `approved_by`
dépendent de la demande de téléconsultation. `patient_id`, `doctor_id` et `status` ne sont
pas déterminants (un patient a plusieurs téléconsultations, un médecin en anime plusieurs,
un statut concerne plusieurs demandes).

**Forme atteinte : BCNF.** *Anomalie évitée* : deux téléconsultations rattachées au même
rendez-vous.

### 4.22 `lab_tests` *(module bonus)*

**DF** : `id →` tous ; `name → id`.

**Clés candidates** : `{id}`, `{name}`.

**Preuve** : `category`, `price`, `turnaround_hours` dépendent de l'analyse.
`category → price` ne tient pas (deux analyses de biochimie ont des tarifs différents :
9,00 € pour une glycémie, 24,00 € pour un bilan lipidique, cf.
`database/migrations/003_seed.sql`, lignes 696-706).

**Forme atteinte : BCNF.** *Anomalie évitée* : deux analyses homonymes avec des tarifs
divergents. *(Si `category → price` était retenu, la relation serait en violation de la
3FN : une relation `lab_categories(category, price)` serait alors nécessaire.)*

### 4.23 `lab_requests` *(module bonus)*

**DF** : `id →` tous.

**Clé candidate** : `{id}`.

**Preuve** : `patient_id`, `doctor_id`, `lab_test_id`, `status`, `notes`, `result_text`,
`requested_at`, `completed_at` dépendent de la demande. Aucun attribut non clé déterminant.

**Forme atteinte : BCNF.** *Anomalie évitée* : un résultat d'analyse ne peut être associé
qu'à une seule demande.

### 4.24 `audit_logs`

**DF** : `id →` tous.

**Clé candidate** : `{id}`.

**Preuve** : `user_id`, `action`, `resource`, `resource_id`, `old_value`, `new_value`,
`ip_address`, `user_agent`, `created_at` dépendent de l'entrée d'audit. Aucun attribut non
clé ne détermine un autre attribut : le même utilisateur produit des milliers d'entrées, la
même action concerne des ressources différentes.

> **Écart assumé à la 1FN.** Les colonnes `old_value` et `new_value` contiennent des
> documents `JSON` dont la structure interne est **non atomique** (plusieurs clés/valeurs).
> Cet écart est **délibéré et documenté** : le journal d'audit doit conserver l'état
> *avant/après* de **26 tables différentes** dont la forme évolue avec le schéma. Les
> alternatives étaient : (a) 26 tables d'historique, soit 26 relations supplémentaires à
> maintenir ; (b) une table clé/valeur, qui ferait perdre la notion de modification
> atomique ; (c) une colonne `TEXT` sérialisée, sans validation par le SGBD. Le `JSON`
> natif de MySQL 8.0 valide la structure, permet l'indexation de champs, et cantonne
> l'écart à **une table de journal, jamais utilisée dans les jointures métier**. La 1FN est
> respectée pour les 25 autres tables et pour toutes les colonnes exploitées par
> l'application.

**Forme atteinte : BCNF** pour la relation ; écart assumé à la 1FN limité aux deux colonnes
`JSON` documenté ci-dessus.

### 4.25 `notifications`

**DF** : `id →` tous.

**Clé candidate** : `{id}`.

**Preuve** : `user_id`, `title`, `message`, `type`, `is_read`, `link`, `created_at`
dépendent de la notification. Aucun attribut non clé déterminant : `user_id` ne détermine
pas `title` (un même utilisateur reçoit des titres différents), `type` ne détermine pas
`is_read`.

**Forme atteinte : BCNF.** *Anomalie évitée* : aucune.

### 4.26 `clinic_settings`

**DF** : `id →` tous, avec la contrainte de domaine `id = 1`.

**Clé candidate** : `{id}` (unique par définition).

**Preuve** : tous les paramètres (`name`, `address`, `phone`, `email`, `currency`,
`vat_rate`, `logo_url`, identifiants Zoom, `updated_at`) dépendent de la ligne unique. Aucun
attribut non clé ne détermine un autre attribut.

**Forme atteinte : BCNF.** *Anomalie évitée* : deux jeux de paramètres concurrents (deux
taux de TVA par défaut, deux logos) — la contrainte `chk_clinic_settings_singleton` garantit
la singularité, qui est ici l'expression de la clé.

---

## 5. Deux corrections volontaires du modèle initial

Le cahier des charges initial comportait deux choix de modélisation qui empêchaient
d'atteindre la BCNF. Ils ont été corrigés. Cette section documente précisément la nature de
chaque défaut, la décomposition appliquée et le gain obtenu.

### 5.1 Correction n° 1 — `users.role_id` remplacé par la table `user_roles`

#### a) Modèle initial

```text
UTILISATEUR(id, email, password_hash, first_name, last_name, phone,
            role_id, is_active, last_login_at, created_at, updated_at)
ROLE(id, code, name, description, is_system)
```

#### b) Défaut constaté

La règle de gestion **RG-02** stipule qu'« un compte peut porter plusieurs rôles » (le jeu de
démonstration attribue deux rôles au super administrateur). Or `role_id` est un **attribut
mono-valué** : la relation n'autorise qu'**un seul** rôle par compte. Pour représenter
plusieurs rôles, seules deux implémentations étaient possibles, toutes deux fautives :

| Variante | Schéma | Défaut formel |
|---|---|---|
| **Variante 1 — duplication de ligne** | `UTILISATEUR(id, role_id, email, password_hash, first_name, last_name, …)` avec la clé primaire composite `(id, role_id)` | Avec la clé `(id, role_id)`, les attributs `email`, `password_hash`, `first_name`, `last_name`, `phone`, `is_active`, `last_login_at` dépendent du **seul** `id`, qui est un **sous-ensemble strict** de la clé. C'est une **dépendance partielle** : la relation viole la **2FN** (et donc la 3FN et la BCNF). Conséquences : l'adresse e-mail et le mot de passe sont dupliqués sur chaque ligne de rôle, avec un risque de divergence (anomalie de mise à jour), et la suppression du dernier rôle d'un compte supprime le compte lui-même (anomalie de suppression). |
| **Variante 2 — liste dans une colonne** | `UTILISATEUR(id, roles, …)` avec `roles = 'DOCTOR,ADMIN'` | La colonne `roles` contient **plusieurs valeurs** : la relation viole la **1FN** (attribut non atomique). Aucune DF ne peut s'exprimer vers un rôle donné, les habilitations ne sont plus interrogeables par jointure ni indexables, et le contrôle d'accès impose un découpage de chaîne applicatif. |

Dans les deux variantes, **la dépendance fonctionnelle `role_id → (code, name, description,
is_system)` devient inaccessible** : soit les attributs du rôle sont dupliqués dans
`UTILISATEUR` (variante 1, avec redondance), soit ils sont perdus (variante 2). Or
`role_id` n'est pas une super-clé de `UTILISATEUR` : c'est cette violation de la définition
de la BCNF (« tout déterminant d'une DF non triviale doit être une super-clé ») qui rend le
modèle initial non conforme dès qu'un utilisateur cumule plusieurs rôles.

#### c) Décomposition appliquée

```text
ROLE(id, code, name, description, is_system, created_at, updated_at)          -- inchangé
UTILISATEUR(id, email, password_hash, first_name, last_name, phone,
            is_active, last_login_at, created_at, updated_at)                -- role_id retiré
UTILISATEUR_ROLE(user_id, role_id, created_at)                               -- association N-N
```

#### d) Vérification

- `UTILISATEUR` : déterminants `id` et `email`, tous deux clés candidates → **BCNF**.
- `UTILISATEUR_ROLE` : clé `(user_id, role_id)` ; `created_at` dépend de la **totalité** de
  la clé (date d'attribution du rôle au compte) → aucune dépendance partielle → **2FN**,
  **3FN** et **BCNF**.
- `ROLE` : inchangé, **BCNF**.
- La jointure `UTILISATEUR ⋈ UTILISATEUR_ROLE ⋈ ROLE` reconstruit exactement l'information
  initiale : la décomposition est **sans perte**.

#### e) Anomalies évitées

| Anomalie | Avant | Après |
|---|---|---|
| Mise à jour | Modifier le mot de passe d'un super administrateur imposait de modifier *n* lignes (une par rôle) — risque de divergence. | Une seule ligne dans `users`. |
| Insertion | Impossible d'attribuer un troisième rôle sans dupliquer le compte (variante 1) ou sans violer la 1FN (variante 2). | Un `INSERT` dans `user_roles` suffit. |
| Suppression | Retirer un rôle pouvait supprimer le compte (variante 1). | `DELETE FROM user_roles` n'affecte que le lien. |
| Traçabilité | La date d'attribution du rôle n'était pas représentable. | `user_roles.created_at` la porte. |

### 5.2 Correction n° 2 — suppression de `consultations.prescription_id`

#### a) Modèle initial

```text
CONSULTATION(id, appointment_id, doctor_id, diagnosis, notes, follow_up_at,
             created_at, updated_at, prescription_id)      -- colonne ajoutée à tort
ORDONNANCE(id, consultation_id, doctor_id, issued_at, status, created_at)
```

#### b) Défaut constaté

Le modèle initial déclarait **les deux côtés** de la même association :

```text
CONSULTATION.id            → CONSULTATION.prescription_id → ORDONNANCE.id
ORDONNANCE.consultation_id → CONSULTATION.id
```

Trois défauts en découlent.

1. **Redondance inter-relations.** Le fait « l'ordonnance O appartient à la consultation C »
   est stocké **deux fois** : par `ORDONNANCE.consultation_id = C` et par
   `CONSULTATION.prescription_id = O`. Aucune contrainte SQL ne peut garantir que les deux
   sens restent cohérents : il s'agit d'une **dépendance fonctionnelle réciproque
   redondante** (`C.id → C.prescription_id` et `O.id → O.consultation_id` exprimant le même
   fait). C'est précisément la redondance que la normalisation vise à éliminer : chaque fait
   ne doit apparaître qu'à un seul endroit. En cas de mise à jour d'un seul côté, la base
   contient deux vérités contradictoires — anomalie de mise à jour que la BCNF, appliquée
   relation par relation, interdit à l'échelle d'un schéma cohérent.
2. **Dépendance circulaire d'insertion.** Pour insérer une consultation il fallait connaître
   l'ordonnance, et pour insérer l'ordonnance il fallait connaître la consultation : aucune
   des deux lignes ne pouvait être créée d'abord. Les clés étrangères étant vérifiées à
   l'insertion, la première écriture était nécessairement rejetée (ou devait passer par une
   colonne nulle transitoire, puis une mise à jour — une transaction en deux temps fragile).
   Le cas majoritaire du modèle — **une consultation sans ordonnance** (40 consultations
   pour 30 ordonnances dans `database/migrations/003_seed.sql`) — devenait pénible à
   représenter.
3. **Cardinalité métier erronée.** `CONSULTATION.prescription_id` étant mono-valué, la
   relation ne pouvait exprimer qu'**une seule ordonnance par consultation**. Or RG-18
   prévoit qu'une consultation peut donner lieu à **plusieurs** ordonnances (traitement
   initial puis renouvellement). La colonne codait donc une cardinalité `(0,1)` là où le
   métier impose `(0,N)`.

#### c) Correction appliquée

```text
CONSULTATION(id, appointment_id, doctor_id, diagnosis, notes, follow_up_at,
             created_at, updated_at)                       -- prescription_id SUPPRIMÉ
ORDONNANCE(id, consultation_id, doctor_id, issued_at, status, created_at)
             -- seule portatrice de la relation (FK ON DELETE CASCADE)
```

#### d) Vérification

- `CONSULTATION` : déterminants `id` et `appointment_id` (clés candidates) → **BCNF**.
- `ORDONNANCE` : déterminant `id` ; `consultation_id` n'est pas unique, conformément à la
  cardinalité `(0,N)` → **BCNF**.
- Le fait d'association n'est plus stocké qu'**une seule fois** : il n'existe plus de
  dépendance réciproque.
- La jointure `CONSULTATION ⋈ ORDONNANCE` reconstruit l'information : décomposition **sans
  perte**.

#### e) Anomalies évitées

| Anomalie | Avant | Après |
|---|---|---|
| Mise à jour | Une seule des deux colonnes modifiée → deux vérités contradictoires. | Le fait est stocké à un seul endroit. |
| Insertion | Cycle : impossible d'insérer une consultation avant son ordonnance et réciproquement. | La consultation est insérée d'abord, l'ordonnance ensuite. |
| Suppression | Supprimer l'ordonnance laissait un `prescription_id` pointant dans le vide (ou imposait un `SET NULL` sur une colonne censée être obligatoire). | `ON DELETE CASCADE` nettoie les ordonnances de la consultation supprimée. |
| Cardinalité | Une seule ordonnance par consultation. | 0 à N ordonnances par consultation. |
| Cas nominal | Consultation sans ordonnance = valeur nulle dans une colonne de liaison. | Aucune colonne, aucun cas particulier. |

---

## 6. Colonnes dérivées conservées et BCNF

Le schéma conserve **six colonnes dérivées**. Cette section démontre qu'elles ne violent pas
la BCNF, puis expose les garanties qui empêchent toute divergence.

### 6.1 Définition du problème

Une colonne dérivée est une colonne dont la valeur peut être **recalculée** à partir d'autres
données. Deux situations très différentes doivent être distinguées :

| Cas | Nature de la dépendance | Effet sur la BCNF |
|---|---|---|
| **Dépendance intra-relation** : `X → Y` où `X` est un attribut **de la même relation** et n'est pas une super-clé | Dépendance fonctionnelle classique | **Violation** de la BCNF (c'est le cas de `quantity, unit_price → line_total` en apparence) |
| **Dépendance inter-relations (agrégat)** : `Y` est la somme ou le produit de lignes d'**une autre relation** | Dépendance fonctionnelle non exprimable dans le schéma de la relation : elle relie `R` à `S` par jointure | **Aucune violation** : dans `R`, le déterminant reste la clé |

### 6.2 `invoices.subtotal`, `vat_amount`, `total_amount`

**DF concernées** :

```text
FACTURE.id → FACTURE.subtotal          (déterminant = clé candidate → super-clé)
FACTURE.id → FACTURE.vat_amount
FACTURE.id → FACTURE.total_amount
FACTURE.subtotal, FACTURE.vat_rate → FACTURE.vat_amount        (déterminant ⊇ clé)
FACTURE.subtotal, FACTURE.vat_rate → FACTURE.total_amount      (déterminant ⊇ clé)
```

Et, par jointure avec `invoice_items` :

```text
FACTURE.id → Σ LIGNE_FACTURE.line_total     (agrégat portant sur une AUTRE relation)
```

**Preuve** : dans la relation `invoices`, les trois montants sont déterminés par la **clé
primaire** `id` (ou par un ensemble qui la contient). Tout déterminant est donc une
super-clé : la relation est en **BCNF**. La dépendance d'agrégat
`invoices.id → Σ invoice_items.line_total` n'est pas une DF de `invoices` au sens strict :
elle relie deux relations et ne peut pas rendre un déterminant non clé, puisqu'elle ne
dépend d'aucun attribut interne à `invoices`.

**Non-dépendance transitive** : on pourrait objecter une chaîne
`id → vat_rate → vat_amount`. Elle est **fausse** : `vat_rate` seul ne détermine pas
`vat_amount` (il faut aussi `subtotal`). Le déterminant réel de `vat_amount` est le couple
`(subtotal, vat_rate)`, qui contient la clé `id` — donc une super-clé : la 3FN et la BCNF
sont préservées.

### 6.3 `medications.stock_quantity`

**DF concernée** :

```text
MEDICAMENT.id → MEDICAMENT.stock_quantity
MEDICAMENT.id → Σ MOUVEMENT_STOCK.quantity (signée par le type)
```

**Preuve** : `stock_quantity` est déterminé par `id`, clé candidate. Aucun attribut non clé
ne détermine le stock (`category`, `supplier` ou `price` ne le déterminent pas). Dans
`medications`, tout déterminant est donc une super-clé : **BCNF**.

**Pourquoi la conservation est légitime malgré la redondance apparente avec le journal ?**
Le journal `stock_movements` reste la **source de vérité** (RG-22) ; `stock_quantity` en est
un **cache** :

| Argument | Détail |
|---|---|
| Performance de lecture | La vue `v_low_stock_medications` et l'écran pharmacie interrogent la quantité à chaque affichage ; un `SUM` sur un journal en croissance (≈ 22 500 lignes à 3 ans) serait exécuté à chaque requête. |
| Écriture unique | La colonne n'est **jamais** écrite par l'application : seuls les triggers `trg_stock_movement_*` la modifient. |
| Garantie d'intégrité | `chk_medications_stock` (`>= 0`) et le contrôle `BEFORE INSERT` du stock empêchent toute dérive négative. |
| Réconciliation | La valeur reste vérifiable à tout instant par
`SELECT SUM(CASE type WHEN 'IN' THEN quantity ELSE -quantity END) FROM stock_movements WHERE medication_id = ?`, contrôle que le script d'amorçage exécute (recherche de stock négatif). |

### 6.4 `invoice_items.line_total`

**DF concernée** : `quantity, unit_price → line_total`.

**Nature exacte de la colonne** :

```sql
`line_total` DECIMAL(12, 2) AS (`quantity` * `unit_price`) STORED
```

**Preuve** : si `line_total` était une colonne ordinaire, la relation
`R(id, invoice_id, label, quantity, unit_price, line_total)` **violerait la BCNF** : le
déterminant `(quantity, unit_price)` n'est pas une super-clé (plusieurs lignes peuvent
partager la même quantité et le même prix unitaire, avec des libellés différents).

Or `line_total` est une **colonne générée `STORED`** : sa valeur est calculée par le SGBD et
la colonne est **non inscriptible**. Un `INSERT` ou un `UPDATE` qui la mentionne est rejeté
par MySQL. Elle ne fait donc pas partie des **faits stockés** : le schéma réellement écrit
par l'application est

```text
LIGNE_FACTURE(id, invoice_id, label, quantity, unit_price)
```

qui est en **BCNF** (seul déterminant : `id`). `line_total` est une **projection calculée**,
au même titre que les colonnes d'une vue : elle est matérialisée (`STORED`) pour permettre
l'agrégation `SUM(line_total)` par les triggers de facture sans recalcul.

**Anomalie évitée** : un total de ligne incohérent avec la quantité et le prix unitaire est
**impossible par construction** — il n'existe pas d'état de la base dans lequel
`line_total ≠ quantity × unit_price`.

### 6.5 `invoices.paid_amount`

**DF concernée** : `FACTURE.id → FACTURE.paid_amount` et
`FACTURE.id → Σ PAIEMENT.amount` (agrégat inter-relations).

**Preuve** : même raisonnement qu'en §6.2 — dans `invoices`, `paid_amount` n'est déterminé
que par la clé (ou par un ensemble la contenant) ; aucun attribut non clé ne le détermine.
La relation reste en **BCNF**. La valeur est maintenue par les trois triggers de paiement,
qui recalculent `paid_amount` **et** `status` dans la même transaction que l'encaissement :
la cohérence entre `payments` et `invoices` est ainsi garantie par le SGBD et non par la
discipline du code applicatif.

### 6.6 Synthèse des colonnes dérivées

| Table | Colonne | Déterminant | Déterminant = super-clé ? | Réécriture BCNF nécessaire ? | Maintenue par |
|---|---|---|---|---|---|
| `invoices` | `subtotal` | `id` | ✅ oui | Non | `trg_invoice_item_after_insert/update/delete` |
| `invoices` | `vat_amount` | `id`, `(subtotal, vat_rate)` | ✅ oui (⊇ clé) | Non | Triggers lignes + `trg_invoice_before_update` |
| `invoices` | `total_amount` | `id`, `(subtotal, vat_rate)` | ✅ oui (⊇ clé) | Non | Triggers lignes + `trg_invoice_before_update` |
| `invoices` | `paid_amount` | `id` | ✅ oui | Non | `trg_payment_after_*` |
| `medications` | `stock_quantity` | `id` | ✅ oui | Non | `trg_stock_movement_*` |
| `invoice_items` | `line_total` | `(quantity, unit_price)` | ❌ non — **mais colonne générée `STORED` non inscriptible** | Non : la colonne est hors du schéma des faits stockés | Le SGBD (MySQL 8.0) |

**Argument d'ensemble.** Une dénormalisation ne viole la BCNF que si elle introduit une
**dépendance fonctionnelle supplémentaire dont le déterminant n'est pas une super-clé**.
Tel serait le cas si l'application écrivait elle-même ces colonnes à partir de valeurs
lues ailleurs : le déterminant réel serait alors un attribut non clé (par exemple
`vat_rate`), ou une donnée externe. Ici :

1. les cinq colonnes maintenues par trigger sont déterminées par la **clé** de leur propre
   relation ;
2. la sixième est **calculée par le SGBD** et non inscriptible ;
3. aucune de ces colonnes n'est utilisée comme **déterminant** d'une autre colonne
   (il n'existe pas de DF `subtotal → status` ou `stock_quantity → alert_threshold`) ;
4. la source de vérité reste toujours la relation détaillée (`invoice_items`,
   `payments`, `stock_movements`), qui satisfait elle-même la BCNF.

La BCNF est donc respectée : la seule dépendance « supplémentaire » est une dépendance
d'**agrégat inter-relations**, qui n'affaiblit aucune clé et dont la cohérence est garantie
par le SGBD. La conservation de ces colonnes relève d'un **arbitrage performance /
redondance contrôlée**, documenté et testé, et non d'un relâchement de la normalisation.

---

## 7. Tableau de synthèse

### 7.1 Forme normale atteinte par table

| # | Table | DF principales retenues | Forme normale atteinte | Anomalie évitée |
|---|---|---|---|---|
| 1 | `roles` | `id →` tous ; `code → id` ; `name → id` | **BCNF** | Deux libellés pour un même code de rôle |
| 2 | `permissions` | `id →` tous ; `code → id` | **BCNF** | Code de permission dupliqué avec libellés divergents |
| 3 | `role_permissions` | aucune DF non triviale | **BCNF** | Attribution stockée deux fois |
| 4 | `users` | `id →` tous ; `email → id` | **BCNF** (après §5.1) | Deux comptes pour une même adresse de connexion |
| 5 | `user_roles` | `(user_id, role_id) → created_at` | **BCNF** | Perte ou duplication de la date d'attribution |
| 6 | `refresh_tokens` | `id →` tous ; `token_hash → id` | **BCNF** | Révocation ambiguë, empreinte dupliquée |
| 7 | `patients` | `id →` tous ; `user_id → id` ; `insurance_number → id` | **BCNF** | Deux dossiers pour un même numéro d'assurance |
| 8 | `specialties` | `id →` tous ; `name → id` | **BCNF** | Spécialité dupliquée |
| 9 | `departments` | `id →` tous ; `name → id` | **BCNF** | Département dupliqué |
| 10 | `doctors` | `id →` tous ; `user_id → id` ; `license_number → id` | **BCNF** | Numéro d'ordre attribué à deux profils |
| 11 | `appointments` | `id →` tous | **BCNF** | Duplication du statut ou du type |
| 12 | `consultations` | `id →` tous ; `appointment_id → id` | **BCNF** (après §5.2) | Deux comptes rendus pour un rendez-vous |
| 13 | `prescriptions` | `id →` tous | **BCNF** | Statut dupliqué ; cardinalité 1-N préservée |
| 14 | `medications` | `id →` tous ; `(name, unit) → id` | **BCNF** | Deux références identiques à prix divergents |
| 15 | `prescription_items` | `id →` tous | **BCNF** | Impossibilité de prescrire deux fois le même médicament |
| 16 | `stock_movements` | `id →` tous | **BCNF** | Mouvement dupliqué ou non imputé |
| 17 | `invoices` | `id →` tous ; `number → id` | **BCNF** | Deux factures portant le même numéro légal |
| 18 | `invoice_items` | `id →` tous ; `(quantity, unit_price) → line_total` | **BCNF** (colonne générée, §6.4) | Total de ligne incohérent |
| 19 | `payments` | `id →` tous | **BCNF** | Encaissement compté deux fois |
| 20 | `shifts` | `id →` tous | **BCNF** | Duplication d'une garde |
| 21 | `meetings` | `id →` tous ; `appointment_id → id` | **BCNF** | Deux téléconsultations pour un rendez-vous |
| 22 | `lab_tests` | `id →` tous ; `name → id` | **BCNF** | Deux analyses homonymes à tarifs divergents |
| 23 | `lab_requests` | `id →` tous | **BCNF** | Résultat rattaché à deux demandes |
| 24 | `audit_logs` | `id →` tous | **BCNF** (écart 1FN limité aux colonnes `JSON`, §4.24) | Perte de l'état avant/après faute de structure |
| 25 | `notifications` | `id →` tous | **BCNF** | Duplication d'une notification |
| 26 | `clinic_settings` | `id →` tous (`id = 1`) | **BCNF** | Deux jeux de paramètres concurrents |

### 7.2 Synthèse globale

| Indicateur | Résultat |
|---|---|
| Tables analysées | **26 / 26** |
| Tables en 1FN | **26 / 26** (écart assumé et documenté sur les 2 colonnes `JSON` d'`audit_logs`) |
| Tables en 2FN | **26 / 26** |
| Tables en 3FN | **26 / 26** |
| Tables en **BCNF** | **26 / 26** |
| NF supérieures (4FN, 5FN) | Non requises : aucune dépendance multivaluée ni dépendance de jointure n'a été identifiée |
| Corrections volontaires du modèle initial | **2** (§5.1 `users.role_id` → `user_roles` ; §5.2 `consultations.prescription_id` → supprimé) |
| Colonnes dérivées conservées | **6**, justifiées au §6 (aucune violation de la BCNF) |
| Écarts assumés | **1** : colonnes `JSON` du journal d'audit (§4.24) |

### 7.3 Ce que la BCNF garantit sur ce schéma

| Garantie | Illustration concrète |
|---|---|
| **Aucune donnée dupliquée entre deux tables** | Un libellé de spécialité, un nom de département, un code de rôle ne sont stockés qu'une seule fois, dans leur référentiel. |
| **Aucune donnée dupliquée dans une table** | Le tarif d'un médecin n'est stocké que dans `doctors`, jamais recopié dans `appointments` ou `invoices`. |
| **Insertion d'un fait indépendant possible** | Un patient peut être créé sans compte (`patients.user_id` nullable) ; une consultation peut être créée sans ordonnance ; un médicament peut être ajouté au catalogue avant toute prescription. |
| **Suppression sans destruction de faits indépendants** | Supprimer un compte ne détruit ni le dossier patient (`SET NULL`) ni le journal d'audit (`SET NULL`) ni les mouvements de stock (`RESTRICT`). |
| **Modification en un seul point** | Changer le tarif d'un médecin ne nécessite qu'un `UPDATE` dans `doctors`. |
| **Redondance maîtrisée et explicite** | Les six colonnes dérivées sont recensées, maintenues par le SGBD et vérifiables par une requête de réconciliation (§6.6). |

---

## 8. Conclusion

Le schéma MediClinic est **entièrement en BCNF** : pour chacune des 26 tables, tout
déterminant d'une dépendance fonctionnelle non triviale est une super-clé. Cette propriété a
été obtenue en corrigeant deux choix du modèle initial du cahier des charges :

1. **`users.role_id` → table de jointure `user_roles`** : la relation N-N entre utilisateurs
   et rôles est la seule modélisation compatible avec la règle « un compte peut cumuler
   plusieurs rôles » sans dépendance partielle (variante 1) ni attribut multivalué
   (variante 2).
2. **Suppression de `consultations.prescription_id`** : la relation
   Consultation–Ordonnance est portée par le seul côté « N », ce qui élimine une redondance
   réciproque, casse le cycle d'insertion et rétablit la cardinalité métier 1-N.

Six colonnes dérivées sont volontairement conservées. Leur analyse montre qu'elles ne
violent pas la BCNF : cinq sont déterminées par la clé de leur propre relation et maintenues
par des triggers transactionnels, la sixième (`invoice_items.line_total`) est une colonne
générée `STORED`, donc non inscriptible et hors du schéma des faits stockés. La source de
vérité reste, dans chaque cas, la relation détaillée — elle-même en BCNF.

Enfin, deux écarts sont **assumés, documentés et argumentés** plutôt que dissimulés : les
colonnes `JSON` du journal d'audit (§4.24) et l'absence de référentiel d'adresses (§4.7).
Ils sont présentés avec la condition qui, si elle venait à être remplie, imposerait une
nouvelle décomposition.

---

*Fin du document — voir aussi le [dictionnaire de données](../database/diagrams/04_dictionnaire_donnees.md).*
