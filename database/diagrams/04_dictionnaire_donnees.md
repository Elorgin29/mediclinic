# 04 — Dictionnaire de données — MediClinic

> **Fichiers SQL de référence** : `database/migrations/001_init.sql` (structure et
> contraintes), `database/migrations/002_views.sql` (vues),
> `database/migrations/003_seed.sql` (valeurs d'exemple).
> **Documents liés** : [`README.md`](README.md) · [`01_mcd.md`](01_mcd.md) ·
> [`02_mld.md`](02_mld.md) · [`03_mpd.md`](03_mpd.md) ·
> [`../../docs/BCNF.md`](../../docs/BCNF.md).

Ce document est le **référentiel de référence** de la base MediClinic : il décrit
**une ligne par colonne** pour les **26 tables** du schéma, soit **231 colonnes**. Il est
destiné au correcteur, aux développeurs et à l'équipe métier.

---

## 1. Légende et conventions

### 1.1 Structure des fiches

Chaque table fait l'objet d'un tableau dont les colonnes sont :

| Colonne du dictionnaire | Signification |
|---|---|
| **Colonne** | Nom physique de la colonne dans la base |
| **Type** | Type SQL exact, tel que déclaré dans `database/migrations/001_init.sql` |
| **Contraintes** | Clé primaire (`PK`), clé étrangère (`FK → table.colonne`), unicité (`UNIQUE`), contrainte de domaine (`CHECK`), valeurs d'`ENUM`, colonne générée |
| **Obligatoire** | `Oui` si la colonne est `NOT NULL` ; `Non` si elle accepte `NULL` ; `—` pour une colonne générée (non inscriptible) |
| **Description métier** | À quoi sert la donnée dans le processus de la clinique |
| **Exemple** | Valeur réaliste, cohérente avec `database/migrations/003_seed.sql` |

### 1.2 Règles de lecture

1. Les colonnes sont listées dans leur **ordre physique** de création.
2. Le mot-clé `ENUM` renvoie au **§28** qui liste toutes les valeurs autorisées et leur
   correspondance avec `packages/shared/src/constants.ts`.
3. Les colonnes **dérivées** (calculées ou maintenues par trigger) sont signalées par la
   mention « *dérivée* » : l'application ne doit jamais les écrire.
4. Les exemples utilisent des dates et des identifiants cohérents avec le jeu de
   démonstration, mais sont donnés à titre d'illustration.
5. `PK` = clé primaire, `FK` = clé étrangère, `UK` = contrainte d'unicité.

### 1.3 Vue d'ensemble des 26 tables

| § | Table | Domaine | Colonnes | Clé primaire | Clés étrangères |
|---|---|---|---|---|---|
| 2 | `roles` | RBAC | 7 | `id` | — |
| 3 | `permissions` | RBAC | 5 | `id` | — |
| 4 | `role_permissions` | RBAC | 2 | `(role_id, permission_id)` | 2 |
| 5 | `users` | Identités | 10 | `id` | — |
| 6 | `user_roles` | Identités | 3 | `(user_id, role_id)` | 2 |
| 7 | `refresh_tokens` | Sécurité | 8 | `id` | 1 |
| 8 | `patients` | Patients | 19 | `id` | 1 |
| 9 | `specialties` | Organisation | 5 | `id` | — |
| 10 | `departments` | Organisation | 6 | `id` | 1 |
| 11 | `doctors` | Organisation | 10 | `id` | 3 |
| 12 | `appointments` | Parcours de soin | 14 | `id` | 4 |
| 13 | `consultations` | Parcours de soin | 8 | `id` | 2 |
| 14 | `prescriptions` | Parcours de soin | 6 | `id` | 2 |
| 15 | `medications` | Pharmacie | 11 | `id` | — |
| 16 | `prescription_items` | Pharmacie | 8 | `id` | 2 |
| 17 | `stock_movements` | Pharmacie | 7 | `id` | 2 |
| 18 | `invoices` | Facturation | 15 | `id` | 3 |
| 19 | `invoice_items` | Facturation | 6 | `id` | 1 |
| 20 | `payments` | Facturation | 8 | `id` | 2 |
| 21 | `shifts` | Ressources humaines | 11 | `id` | 3 |
| 22 | `meetings` | Téléconsultation | 18 | `id` | 5 |
| 23 | `lab_tests` | Laboratoire *(bonus)* | 5 | `id` | — |
| 24 | `lab_requests` | Laboratoire *(bonus)* | 9 | `id` | 3 |
| 25 | `audit_logs` | Supervision | 10 | `id` | 1 |
| 26 | `notifications` | Supervision | 8 | `id` | 1 |
| 27 | `clinic_settings` | Paramétrage | 12 | `id` (singleton) | — |
| | **Total** | | **231 colonnes** | **26 clés primaires** | **41 clés étrangères** |

---

## 2. `roles` — rôles applicatifs

**Clé primaire** : `id` · **Unicités** : `uq_roles_code`, `uq_roles_name` · **Index** : aucun index secondaire

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant technique du rôle, utilisé dans toute la matrice d'habilitations. | `3` |
| `code` | `VARCHAR(50)` | UNIQUE (`uq_roles_code`) | Oui | Code technique du rôle, employé par le code applicatif pour les contrôles d'accès. | `'DOCTOR'` |
| `name` | `VARCHAR(80)` | UNIQUE (`uq_roles_name`) | Oui | Libellé affiché dans l'interface d'administration des rôles. | `'Médecin'` |
| `description` | `VARCHAR(255)` | — | Non | Description des responsabilités associées au rôle, affichée dans la liste des rôles. | `'Consultations, ordonnances, téléconsultations'` |
| `is_system` | `BOOLEAN` | — | Oui (défaut `FALSE`) | Indique un rôle fourni par l'application et non supprimable par l'administrateur. | `TRUE` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date et heure de création du rôle (audit). | `'2026-01-05 09:12:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date et heure de la dernière modification. | `'2026-02-11 14:03:22'` |

---

## 3. `permissions` — permissions atomiques

**Clé primaire** : `id` · **Unicités** : `uq_permissions_code` · **Index** : `idx_permissions_resource` · **CHECK** : `chk_permissions_action`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de la permission atomique. | `2` |
| `code` | `VARCHAR(80)` | UNIQUE (`uq_permissions_code`) | Oui | Code `ressource:action` vérifié à chaque appel d'API. | `'patient:read'` |
| `resource` | `VARCHAR(50)` | Index (`idx_permissions_resource`) | Oui | Ressource contrôlée, utilisée pour regrouper les permissions dans la matrice. | `'patient'` |
| `action` | `VARCHAR(20)` | CHECK `chk_permissions_action` : `create`, `read`, `update`, `delete`, `manage` | Oui | Action autorisée sur la ressource. | `'read'` |
| `description` | `VARCHAR(255)` | — | Non | Libellé français affiché dans l'écran de gestion des habilitations. | `'Consulter les dossiers patients'` |

---

## 4. `role_permissions` — matrice rôle × permission

**Clé primaire** : `(role_id, permission_id)` · **Index** : `idx_role_permissions_permission` · **FK** : `roles`, `permissions` (les deux en `ON DELETE CASCADE`)

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `role_id` | `INT UNSIGNED` | PK, FK → `roles.id` (`CASCADE`) | Oui | Rôle auquel la permission est accordée. | `3` |
| `permission_id` | `INT UNSIGNED` | PK, FK → `permissions.id` (`CASCADE`) | Oui | Permission accordée à ce rôle. | `2` |

> Une ligne de cette table signifie : « le rôle `role_id` possède la permission
> `permission_id` ». La matrice complète est générée par
> `database/migrations/003_seed.sql` (section 3).

---

## 5. `users` — comptes d'authentification

**Clé primaire** : `id` · **Unicités** : `uq_users_email` · **Index** : `idx_users_active`, `idx_users_name`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant du compte, référencé par toutes les tables de traçabilité (auteur, demandeur, encaisseur…). | `4` |
| `email` | `VARCHAR(190)` | UNIQUE (`uq_users_email`) | Oui | Identifiant de connexion ; sert aussi d'adresse de notification. | `'amine.haddad@mediclinic.fr'` |
| `password_hash` | `VARCHAR(255)` | — | Oui | Empreinte bcrypt (12 rounds) du mot de passe. **Jamais exposée par les vues publiques.** | `'$2b$12$2f9IKYQ7jtC9/VnBGH/JPucdDkFch2w6z9TlTpFc.iWqDgNF711d3.'` |
| `first_name` | `VARCHAR(80)` | — | Oui | Prénom de la personne. | `'Amine'` |
| `last_name` | `VARCHAR(80)` | — | Oui | Nom de famille, utilisé pour le tri alphabétique. | `'Haddad'` |
| `phone` | `VARCHAR(30)` | — | Non | Téléphone professionnel ou personnel. | `'0340000011'` |
| `is_active` | `BOOLEAN` | Index (`idx_users_active`) | Oui (défaut `TRUE`) | Compte actif. La désactivation remplace la suppression lorsqu'un salarié quitte la clinique (préserve l'historique). | `TRUE` |
| `last_login_at` | `DATETIME` | — | Non | Date et heure de la dernière connexion réussie (détection des comptes dormants). | `'2026-11-17 08:45:12'` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de création du compte. | `'2026-01-05 09:30:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification du compte. | `'2026-06-12 16:20:45'` |

---

## 6. `user_roles` — rôles portés par un compte

**Clé primaire** : `(user_id, role_id)` · **Index** : `idx_user_roles_role` · **FK** : `users`, `roles` (les deux en `ON DELETE CASCADE`)

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `user_id` | `INT UNSIGNED` | PK, FK → `users.id` (`CASCADE`) | Oui | Compte utilisateur concerné. | `1` |
| `role_id` | `INT UNSIGNED` | PK, FK → `roles.id` (`CASCADE`) | Oui | Rôle attribué au compte. | `1` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date d'attribution du rôle : attribut porté par l'**association**, il dépend du couple (compte, rôle). | `'2026-01-05 09:31:00'` |

> Un même compte peut cumuler plusieurs rôles : le jeu de démonstration attribue
> `SUPER_ADMIN` **et** `ADMIN` à l'utilisateur n° 1 (deux lignes distinctes).

---

## 7. `refresh_tokens` — jetons de session

**Clé primaire** : `id` · **Unicités** : `uq_refresh_tokens_hash` · **Index** : `idx_refresh_tokens_user` · **FK** : `users` (`ON DELETE CASCADE`)

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant du jeton. | `1042` |
| `user_id` | `INT UNSIGNED` | FK → `users.id` (`CASCADE`) | Oui | Compte propriétaire du jeton (session ouverte). | `4` |
| `token_hash` | `CHAR(64)` | UNIQUE (`uq_refresh_tokens_hash`) | Oui | Empreinte **SHA-256** du jeton : le jeton en clair n'est jamais stocké (sécurité en cas de fuite de la base). | `'9f2c1b7a4e5d…'` (64 caractères hexadécimaux) |
| `expires_at` | `DATETIME` | — | Oui | Date d'expiration du jeton, au-delà de laquelle il est refusé. | `'2026-12-17 08:00:00'` |
| `revoked_at` | `DATETIME` | — | Non | Date de révocation (déconnexion explicite, changement de mot de passe, incident de sécurité). | `'2026-11-17 18:30:00'` |
| `user_agent` | `VARCHAR(255)` | — | Non | Agent utilisateur du navigateur, utile pour identifier une session suspecte. | `'Mozilla/5.0 (Windows NT 10.0; Win64; x64)…'` |
| `ip_address` | `VARCHAR(45)` | — | Non | Adresse IP d'émission (45 caractères pour couvrir l'IPv6). | `'192.168.1.24'` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date d'émission du jeton. | `'2026-11-17 08:00:00'` |

---

## 8. `patients` — dossiers patients

**Clé primaire** : `id` · **Unicités** : `uq_patients_user`, `uq_patients_insurance` · **Index** : `idx_patients_name`, `idx_patients_email`, `idx_patients_phone` · **FK** : `users` (`ON DELETE SET NULL`) · **CHECK** : `chk_patients_birth`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Numéro de dossier patient (identifiant affiché au secrétariat). | `1` |
| `user_id` | `INT UNSIGNED` | FK → `users.id` (`SET NULL`), UNIQUE (`uq_patients_user`) | **Non** | Compte du portail patient associé. Facultatif : un dossier peut être créé au guichet avant l'ouverture d'un compte, et tous les patients n'ont pas de compte. | `24` (ou `NULL`) |
| `first_name` | `VARCHAR(80)` | — | Oui | Prénom du patient. | `'Lucie'` |
| `last_name` | `VARCHAR(80)` | — | Oui | Nom de naissance ou d'usage, critère principal de recherche. | `'Durand'` |
| `birth_date` | `DATE` | CHECK `chk_patients_birth` (`>= '1900-01-01'`) | Oui | Date de naissance : sert au calcul de l'âge et au rapprochement d'homonymes. | `'1978-04-11'` |
| `gender` | `ENUM('MALE','FEMALE','OTHER')` | ENUM | Oui | Sexe administratif du patient. | `'FEMALE'` |
| `address` | `VARCHAR(255)` | — | Non | Adresse postale (utilisée sur les factures et courriers). | `'33 rue des Lilas'` |
| `city` | `VARCHAR(80)` | — | Non | Ville de résidence. | `'Paris'` |
| `postal_code` | `VARCHAR(10)` | — | Non | Code postal. | `'75015'` |
| `phone` | `VARCHAR(30)` | Index (`idx_patients_phone`) | Non | Téléphone de contact pour la confirmation des rendez-vous. | `'0341000001'` |
| `email` | `VARCHAR(190)` | Index (`idx_patients_email`) | Non | Courriel de contact (envoi des ordonnances et factures). | `'lucie.durand@email.fr'` |
| `blood_group` | `ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-')` | ENUM | Non | Groupe sanguin : information vitale en urgence. | `'A+'` |
| `allergies` | `TEXT` | — | Non | Allergies connues, affichées en alerte au médecin et au pharmacien. | `'Pénicilline'` |
| `medical_history` | `TEXT` | — | Non | Antécédents médicaux et chirurgicaux. | `'Antécédents renseignés lors de l'admission : hypertension artérielle traitée'` |
| `emergency_contact_name` | `VARCHAR(120)` | — | Non | Personne à prévenir en cas d'urgence. | `'Contact Durand'` |
| `emergency_contact_phone` | `VARCHAR(30)` | — | Non | Téléphone du contact d'urgence. | `'0342765430'` |
| `insurance_number` | `VARCHAR(50)` | UNIQUE (`uq_patients_insurance`) | Non | Numéro d'assurance ou de mutuelle, unique lorsqu'il est renseigné. | `'ASS-000001'` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date d'ouverture du dossier. | `'2026-01-12 08:40:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification du dossier. | `'2026-10-02 11:15:30'` |

---

## 9. `specialties` — spécialités médicales

**Clé primaire** : `id` · **Unicités** : `uq_specialties_name`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de la spécialité. | `1` |
| `name` | `VARCHAR(80)` | UNIQUE (`uq_specialties_name`) | Oui | Nom de la spécialité, affiché dans l'annuaire et les filtres. | `'Cardiologie'` |
| `description` | `VARCHAR(500)` | — | Non | Périmètre de la spécialité. | `'Diagnostic et suivi des maladies cardiovasculaires'` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de création de la ligne de référentiel. | `'2026-01-05 10:00:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification. | `'2026-03-01 09:00:00'` |

---

## 10. `departments` — départements et services

**Clé primaire** : `id` · **Unicités** : `uq_departments_name` · **Index** : `idx_departments_head` · **FK** : `doctors` (`ON DELETE SET NULL`, contrainte ajoutée par `ALTER TABLE`)

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant du département. | `1` |
| `name` | `VARCHAR(80)` | UNIQUE (`uq_departments_name`) | Oui | Nom du service, utilisé dans les plannings et les statistiques d'activité. | `'Cardiologie'` |
| `description` | `VARCHAR(500)` | — | Non | Description de l'activité du service. | `'Unité de cardiologie et explorations fonctionnelles'` |
| `head_doctor_id` | `INT UNSIGNED` | FK → `doctors.id` (`SET NULL`), index | Non | Médecin chef de service. Facultatif : un service peut être sans chef après un départ ; la suppression du médecin ne supprime pas le département. | `1` (ou `NULL`) |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de création. | `'2026-01-05 10:05:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification. | `'2026-02-14 15:45:00'` |

---

## 11. `doctors` — profils médecins

**Clé primaire** : `id` · **Unicités** : `uq_doctors_user`, `uq_doctors_license` · **Index** : `idx_doctors_specialty`, `idx_doctors_department` · **FK** : `users` (`CASCADE`), `specialties` (`RESTRICT`), `departments` (`SET NULL`) · **CHECK** : `chk_doctors_fee`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant du profil médecin. | `1` |
| `user_id` | `INT UNSIGNED` | FK → `users.id` (`CASCADE`), UNIQUE (`uq_doctors_user`) | Oui | Compte de connexion du médecin (relation 1-1). | `4` |
| `specialty_id` | `INT UNSIGNED` | FK → `specialties.id` (`RESTRICT`), index | Oui | Spécialité exercée : un médecin n'en a qu'une. | `1` |
| `department_id` | `INT UNSIGNED` | FK → `departments.id` (`SET NULL`), index | Non | Département de rattachement (facultatif : un praticien peut intervenir dans plusieurs services sans y être affecté). | `1` |
| `license_number` | `VARCHAR(50)` | UNIQUE (`uq_doctors_license`) | Oui | Numéro d'ordre des médecins : identifiant professionnel réglementaire. | `'MED-CARD-0001'` |
| `consultation_fee` | `DECIMAL(10,2)` | CHECK `chk_doctors_fee` (`>= 0`) | Oui (défaut `50.00`) | Tarif de consultation utilisé comme prix unitaire par défaut des factures. | `70.00` |
| `bio` | `TEXT` | — | Non | Présentation du praticien affichée aux patients. | `'Cardiologue interventionnel, 15 ans d'expérience hospitalière.'` |
| `is_accepting_patients` | `BOOLEAN` | — | Oui (défaut `TRUE`) | Indique si le médecin accepte de nouveaux patients (filtre du portail de prise de rendez-vous). | `TRUE` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de création du profil. | `'2026-01-06 09:00:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification. | `'2026-05-20 12:00:00'` |

---

## 12. `appointments` — rendez-vous

**Clé primaire** : `id` · **Index** : `idx_appointments_patient`, `idx_appointments_doctor`, `idx_appointments_status`, `idx_appointments_scheduled`, `idx_appointments_department` · **FK** : `patients` (`CASCADE`), `doctors` (`RESTRICT`), `departments` (`SET NULL`), `users` (`SET NULL`) · **CHECK** : `chk_appointments_duration`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant du rendez-vous. | `141` |
| `patient_id` | `INT UNSIGNED` | FK → `patients.id` (`CASCADE`), index composite | Oui | Patient reçu. | `3` |
| `doctor_id` | `INT UNSIGNED` | FK → `doctors.id` (`RESTRICT`), index composite | Oui | Médecin qui reçoit. | `5` |
| `department_id` | `INT UNSIGNED` | FK → `departments.id` (`SET NULL`), index | Non | Département d'accueil du rendez-vous. | `3` |
| `scheduled_at` | `DATETIME` | Index (`idx_appointments_scheduled`) | Oui | Date et heure du rendez-vous : donnée pivot de l'agenda. | `'2026-11-18 09:00:00'` |
| `duration` | `SMALLINT UNSIGNED` | CHECK `chk_appointments_duration` (entre 10 et 240) | Oui (défaut `30`) | Durée prévue en minutes. | `30` |
| `status` | `ENUM('PENDING','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW')` | ENUM, index | Oui (défaut `'PENDING'`) | Étape du cycle de vie du rendez-vous ; pilote la file d'attente de l'accueil. | `'CHECKED_IN'` |
| `type` | `ENUM('IN_PERSON','TELEMEDICINE')` | ENUM | Oui (défaut `'IN_PERSON'`) | Consultation en présentiel ou à distance. | `'IN_PERSON'` |
| `reason` | `VARCHAR(500)` | — | Non | Motif de consultation exprimé par le patient (ou saisi à l'accueil). | `'Renouvellement d'ordonnance'` |
| `notes` | `TEXT` | — | Non | Notes internes de l'équipe soignante (non visibles du patient). | `'Patient revu en consultation externe.'` |
| `cancelled_reason` | `VARCHAR(500)` | — | Non | Motif d'annulation, conservé pour l'analyse des rendez-vous non honorés. | `'Patiente indisponible'` |
| `created_by` | `INT UNSIGNED` | FK → `users.id` (`SET NULL`) | Non | Utilisateur (secrétariat, soignant ou patient) ayant créé le rendez-vous. | `20` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de création de l'enregistrement. | `'2026-11-12 07:30:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification (replanification, changement de statut). | `'2026-11-18 08:55:00'` |

---

## 13. `consultations` — comptes rendus de consultation

**Clé primaire** : `id` · **Unicités** : `uq_consultations_appointment` · **Index** : `idx_consultations_doctor` · **FK** : `appointments` (`CASCADE`), `doctors` (`RESTRICT`)

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de la consultation (compte rendu). | `1` |
| `appointment_id` | `INT UNSIGNED` | FK → `appointments.id` (`CASCADE`), UNIQUE (`uq_consultations_appointment`) | Oui | Rendez-vous d'origine. L'unicité garantit **une seule** consultation par rendez-vous. | `101` |
| `doctor_id` | `INT UNSIGNED` | FK → `doctors.id` (`RESTRICT`), index composite | Oui | Médecin rédacteur du compte rendu. | `1` |
| `diagnosis` | `TEXT` | — | Oui | Diagnostic posé : donnée médicale centrale, obligatoire pour clore la consultation. | `'Hypertension artérielle essentielle stade 1'` |
| `notes` | `TEXT` | — | Non | Observations cliniques, examen, conduite à tenir. | `'Examen clinique complet. Constantes stables. Traitement ajusté et surveillance rapprochée.'` |
| `follow_up_at` | `DATE` | — | Non | Date de suivi conseillée ; alimente les rappels de l'accueil. | `'2026-12-05'` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de saisie du compte rendu. | `'2026-11-10 10:25:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification (correction du compte rendu). | `'2026-11-10 10:40:00'` |

> **Absence volontaire** : cette table **ne contient pas** de colonne `prescription_id`.
> La relation Consultation–Ordonnance est portée par `prescriptions.consultation_id` :
> voir [`../../docs/BCNF.md`](../../docs/BCNF.md) §5.2.

---

## 14. `prescriptions` — ordonnances

**Clé primaire** : `id` · **Index** : `idx_prescriptions_consultation`, `idx_prescriptions_doctor`, `idx_prescriptions_status` · **FK** : `consultations` (`CASCADE`), `doctors` (`RESTRICT`)

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de l'ordonnance (numéro affiché au patient). | `1` |
| `consultation_id` | `INT UNSIGNED` | FK → `consultations.id` (`CASCADE`), index | Oui | Consultation à l'issue de laquelle l'ordonnance est émise. | `1` |
| `doctor_id` | `INT UNSIGNED` | FK → `doctors.id` (`RESTRICT`), index | Oui | Médecin prescripteur (donnée réglementaire non effaçable). | `1` |
| `issued_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date d'émission de l'ordonnance. | `'2026-11-10 10:30:00'` |
| `status` | `ENUM('ISSUED','DISPENSED','CANCELLED')` | ENUM, index | Oui (défaut `'ISSUED'`) | Cycle de vie : émise, dispensée par la pharmacie, annulée. | `'ISSUED'` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de création de l'enregistrement. | `'2026-11-10 10:30:00'` |

---

## 15. `medications` — catalogue pharmaceutique et stock

**Clé primaire** : `id` · **Unicités** : `uq_medications_name_unit` · **Index** : `idx_medications_category`, `idx_medications_expiry`, `idx_medications_stock` · **CHECK** : `chk_medications_price`, `chk_medications_stock`, `chk_medications_threshold`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de la référence au catalogue. | `1` |
| `name` | `VARCHAR(120)` | UNIQUE avec `unit` (`uq_medications_name_unit`) | Oui | Nom du médicament (DCI et dosage). | `'Paracétamol 500 mg'` |
| `category` | `VARCHAR(80)` | Index (`idx_medications_category`) | Oui | Classe thérapeutique, utilisée pour filtrer le catalogue et les statistiques. | `'Antalgique'` |
| `unit` | `VARCHAR(30)` | UNIQUE avec `name` | Oui | Unité de conditionnement : un même nom peut exister en plusieurs conditionnements. | `'comprimé'` |
| `price` | `DECIMAL(10,2)` | CHECK `chk_medications_price` (`>= 0`) | Oui (défaut `0.00`) | Prix unitaire de vente, base de facturation des médicaments délivrés. | `0.05` |
| `stock_quantity` | `INT` | CHECK `chk_medications_stock` (`>= 0`), index · ***dérivée*** | Oui (défaut `0`) | Quantité disponible. **Maintenue exclusivement par les triggers** à partir de `stock_movements` : jamais écrite par l'application. | `180` |
| `alert_threshold` | `INT` | CHECK `chk_medications_threshold` (`>= 0`) | Oui (défaut `10`) | Seuil en dessous duquel la référence est signalée au pharmacien. | `100` |
| `expiry_date` | `DATE` | Index (`idx_medications_expiry`) | Non | Date de péremption du lot courant. | `'2027-12-31'` |
| `supplier` | `VARCHAR(120)` | — | Non | Fournisseur habituel, utile au réapprovisionnement. | `'Pharma Distribution'` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date d'ajout au catalogue. | `'2026-01-07 09:00:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification (mise à jour par les triggers de stock). | `'2026-11-16 15:30:00'` |

---

## 16. `prescription_items` — lignes d'ordonnance

**Clé primaire** : `id` · **Index** : `idx_prescription_items_prescription`, `idx_prescription_items_medication` · **FK** : `prescriptions` (`CASCADE`), `medications` (`RESTRICT`) · **CHECK** : `chk_prescription_items_quantity`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de la ligne : permet de modifier une posologie sans toucher aux autres lignes. | `1` |
| `prescription_id` | `INT UNSIGNED` | FK → `prescriptions.id` (`CASCADE`), index | Oui | Ordonnance à laquelle appartient la ligne. | `1` |
| `medication_id` | `INT UNSIGNED` | FK → `medications.id` (`RESTRICT`), index | Oui | Médicament prescrit. | `2` |
| `dosage` | `VARCHAR(120)` | — | Oui | Posologie par prise. | `'1 comprimé'` |
| `frequency` | `VARCHAR(120)` | — | Oui | Nombre de prises par jour. | `'3 fois par jour'` |
| `duration` | `VARCHAR(120)` | — | Oui | Durée du traitement. | `'7 jours'` |
| `instructions` | `VARCHAR(500)` | — | Non | Conseils de prise transmis au patient. | `'À prendre pendant les repas'` |
| `quantity` | `INT UNSIGNED` | CHECK `chk_prescription_items_quantity` (`>= 1`) | Oui (défaut `1`) | Quantité totale prescrite (base de la dispensation et de la sortie de stock). | `1` |

---

## 17. `stock_movements` — journal des mouvements de stock

**Clé primaire** : `id` · **Index** : `idx_stock_movements_medication`, `idx_stock_movements_user`, `idx_stock_movements_type` · **FK** : `medications` (`RESTRICT`), `users` (`RESTRICT`) · **CHECK** : `chk_stock_movements_quantity`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant du mouvement. | `1` |
| `medication_id` | `INT UNSIGNED` | FK → `medications.id` (`RESTRICT`), index composite | Oui | Référence concernée par le mouvement. | `1` |
| `type` | `ENUM('IN','OUT')` | ENUM, index | Oui | Sens du mouvement : entrée (réception) ou sortie (dispensation, destruction de lot périmé). | `'IN'` |
| `quantity` | `INT UNSIGNED` | CHECK `chk_stock_movements_quantity` (`>= 1`) | Oui | Quantité déplacée (toujours positive : le sens est porté par `type`). | `500` |
| `reason` | `VARCHAR(255)` | — | Oui | Motif du mouvement, exigé pour la traçabilité pharmaceutique. | `'Réception de la commande trimestrielle'` |
| `user_id` | `INT UNSIGNED` | FK → `users.id` (`RESTRICT`), index | Oui | Utilisateur auteur du mouvement (imputation nominative obligatoire). | `17` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Horodatage du mouvement. | `'2026-08-20 09:00:00'` |

> **Source de vérité** : `medications.stock_quantity` est le cache de ce journal. Un
> mouvement `OUT` dont la quantité dépasse le stock disponible est **refusé** par le
> trigger `trg_stock_movement_before_insert`.

---

## 18. `invoices` — factures

**Clé primaire** : `id` · **Unicités** : `uq_invoices_number` · **Index** : `idx_invoices_patient`, `idx_invoices_status`, `idx_invoices_issued`, `idx_invoices_consultation` · **FK** : `patients` (`RESTRICT`), `consultations` (`SET NULL`), `users` (`SET NULL`) · **CHECK** : `chk_invoices_totals`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant interne de la facture. | `1` |
| `number` | `VARCHAR(30)` | UNIQUE (`uq_invoices_number`) | Oui | Numéro légal de facture, unique et non réutilisable, imprimé sur le PDF. | `'FAC-2026-00001'` |
| `patient_id` | `INT UNSIGNED` | FK → `patients.id` (`RESTRICT`), index composite | Oui | Patient facturé. | `8` |
| `consultation_id` | `INT UNSIGNED` | FK → `consultations.id` (`SET NULL`), index | Non | Consultation facturée. Facultatif : la clinique facture aussi des actes hors consultation. | `1` |
| `subtotal` | `DECIMAL(12,2)` | CHECK `>= 0` · ***dérivée*** | Oui (défaut `0.00`) | Total hors taxes, recalculé par trigger à partir des lignes de facture. | `70.00` |
| `vat_rate` | `DECIMAL(5,2)` | CHECK `>= 0` | Oui (défaut `20.00`) | Taux de TVA appliqué à la facture (20 % en France pour les actes médicaux non exonérés). | `20.00` |
| `vat_amount` | `DECIMAL(12,2)` | CHECK `>= 0` · ***dérivée*** | Oui (défaut `0.00`) | Montant de TVA = `subtotal × vat_rate / 100`, recalculé par trigger. | `14.00` |
| `total_amount` | `DECIMAL(12,2)` | CHECK `>= 0` · ***dérivée*** | Oui (défaut `0.00`) | Total TTC = `subtotal × (1 + vat_rate / 100)`, recalculé par trigger. | `84.00` |
| `paid_amount` | `DECIMAL(12,2)` | CHECK `>= 0` · ***dérivée*** | Oui (défaut `0.00`) | Somme des encaissements, recalculée par trigger à chaque paiement. | `84.00` |
| `status` | `ENUM('DRAFT','ISSUED','PARTIALLY_PAID','PAID','CANCELLED')` | ENUM, index | Oui (défaut `'DRAFT'`) | État de la facture, piloté par les triggers de paiement. | `'PAID'` |
| `issued_at` | `DATETIME` | Index (`idx_invoices_issued`) | Oui (défaut `CURRENT_TIMESTAMP`) | Date d'émission (base des statistiques de chiffre d'affaires facturé). | `'2026-11-10 10:30:00'` |
| `due_date` | `DATE` | — | Oui | Date d'échéance de règlement (30 jours après émission), base des relances. | `'2026-12-10'` |
| `created_by` | `INT UNSIGNED` | FK → `users.id` (`SET NULL`) | Non | Utilisateur ayant émis la facture (comptable ou réceptionniste). | `22` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de création de l'enregistrement. | `'2026-11-10 10:30:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification (y compris mise à jour automatique des totaux). | `'2026-11-12 10:30:00'` |

---

## 19. `invoice_items` — lignes de facture

**Clé primaire** : `id` · **Index** : `idx_invoice_items_invoice` · **FK** : `invoices` (`CASCADE`) · **CHECK** : `chk_invoice_items_quantity`, `chk_invoice_items_price`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de la ligne de facture. | `1` |
| `invoice_id` | `INT UNSIGNED` | FK → `invoices.id` (`CASCADE`), index | Oui | Facture à laquelle la ligne appartient. | `1` |
| `label` | `VARCHAR(200)` | — | Oui | Libellé facturé : honoraires de consultation, acte complémentaire, examen. | `'Consultation Cardiologie — Dr Haddad'` |
| `quantity` | `INT UNSIGNED` | CHECK `chk_invoice_items_quantity` (`>= 1`) | Oui (défaut `1`) | Quantité facturée. | `1` |
| `unit_price` | `DECIMAL(10,2)` | CHECK `chk_invoice_items_price` (`>= 0`) | Oui (défaut `0.00`) | Prix unitaire hors taxes. | `70.00` |
| `line_total` | `DECIMAL(12,2) AS (quantity * unit_price) STORED` | Colonne générée `STORED` | — (non inscriptible) | Total de la ligne, calculé par le SGBD : `quantité × prix unitaire`. | `70.00` |

---

## 20. `payments` — encaissements

**Clé primaire** : `id` · **Index** : `idx_payments_invoice`, `idx_payments_paid_at` · **FK** : `invoices` (`CASCADE`), `users` (`RESTRICT`) · **CHECK** : `chk_payments_amount`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de l'encaissement. | `1` |
| `invoice_id` | `INT UNSIGNED` | FK → `invoices.id` (`CASCADE`), index composite | Oui | Facture réglée (un règlement partiel est autorisé : plusieurs lignes par facture). | `1` |
| `amount` | `DECIMAL(12,2)` | CHECK `chk_payments_amount` (`> 0`) | Oui | Montant encaissé, strictement positif. | `84.00` |
| `method` | `ENUM('CASH','CARD','TRANSFER','INSURANCE','CHEQUE')` | ENUM | Oui | Mode de règlement utilisé au guichet. | `'CARD'` |
| `paid_at` | `DATETIME` | Index (`idx_payments_paid_at`) | Oui (défaut `CURRENT_TIMESTAMP`) | Date et heure de l'encaissement (base des recettes). | `'2026-11-12 09:15:00'` |
| `reference` | `VARCHAR(120)` | — | Non | Référence externe : numéro de chèque, identifiant de transaction, numéro de dossier d'assurance. | `'REF-000001'` |
| `recorded_by` | `INT UNSIGNED` | FK → `users.id` (`RESTRICT`) | Oui | Utilisateur ayant encaissé (imputation nominative de caisse, non effaçable). | `22` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de création de la ligne d'encaissement. | `'2026-11-12 09:15:00'` |

---

## 21. `shifts` — gardes et astreintes

**Clé primaire** : `id` · **Index** : `idx_shifts_doctor`, `idx_shifts_department`, `idx_shifts_period` · **FK** : `doctors` (`CASCADE`), `departments` (`CASCADE`), `users` (`SET NULL`) · **CHECK** : `chk_shifts_dates`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de la garde. | `3` |
| `doctor_id` | `INT UNSIGNED` | FK → `doctors.id` (`CASCADE`), index composite | Oui | Médecin d'astreinte. | `3` |
| `department_id` | `INT UNSIGNED` | FK → `departments.id` (`CASCADE`), index composite | Oui | Département couvert par la garde. | `2` |
| `start_at` | `DATETIME` | Index (`idx_shifts_period`) | Oui | Début de la garde. | `'2026-11-18 08:00:00'` |
| `end_at` | `DATETIME` | CHECK `chk_shifts_dates` (`> start_at`) | Oui | Fin de la garde, strictement postérieure au début. | `'2026-11-18 16:00:00'` |
| `type` | `ENUM('DAY','NIGHT','ON_CALL')` | ENUM | Oui (défaut `'DAY'`) | Nature de la garde : jour, nuit ou astreinte à domicile. | `'DAY'` |
| `status` | `ENUM('SCHEDULED','CONFIRMED','COMPLETED','CANCELLED')` | ENUM | Oui (défaut `'SCHEDULED'`) | État de la garde. | `'CONFIRMED'` |
| `notes` | `VARCHAR(500)` | — | Non | Consignes particulières transmises au médecin de garde. | `'Consultations pédiatriques du jour'` |
| `created_by` | `INT UNSIGNED` | FK → `users.id` (`SET NULL`) | Non | Utilisateur ayant planifié la garde (cadre de santé, administrateur). | `2` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de création du planning. | `'2026-11-01 08:00:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification. | `'2026-11-15 10:00:00'` |

---

## 22. `meetings` — téléconsultations

**Clé primaire** : `id` · **Unicités** : `uq_meetings_appointment` · **Index** : `idx_meetings_patient`, `idx_meetings_doctor`, `idx_meetings_status` · **FK** : `appointments` (`SET NULL`), `patients` (`CASCADE`), `doctors` (`RESTRICT`), `users` ×2 (`RESTRICT`, `SET NULL`) · **CHECK** : `chk_meetings_duration`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de la demande de téléconsultation. | `3` |
| `appointment_id` | `INT UNSIGNED` | FK → `appointments.id` (`SET NULL`), UNIQUE (`uq_meetings_appointment`) | Non | Rendez-vous associé. Facultatif : une téléconsultation peut être demandée avant tout rendez-vous. | `142` |
| `patient_id` | `INT UNSIGNED` | FK → `patients.id` (`CASCADE`), index composite | Oui | Patient demandeur. | `11` |
| `doctor_id` | `INT UNSIGNED` | FK → `doctors.id` (`RESTRICT`), index composite | Oui | Médecin sollicité. | `1` |
| `reason` | `VARCHAR(500)` | — | Oui | Motif de la demande ; sert au médecin pour accepter ou refuser. | `'Téléconsultation de suivi cardiologique'` |
| `preferred_at` | `DATETIME` | — | Oui | Créneau souhaité par le demandeur. | `'2026-11-18 10:30:00'` |
| `duration` | `SMALLINT UNSIGNED` | CHECK `chk_meetings_duration` (entre 10 et 240) | Oui (défaut `30`) | Durée prévue en minutes. | `30` |
| `zoom_meeting_id` | `VARCHAR(50)` | — | Non | Identifiant de la réunion créée chez Zoom. | `'84500000103'` |
| `join_url` | `VARCHAR(500)` | — | Non | Lien de connexion destiné au patient. Secret à durée limitée. | `'https://zoom.us/j/84500000103'` |
| `start_url` | `VARCHAR(500)` | — | Non | Lien de démarrage réservé au praticien (donne les droits d'hôte). | `'https://zoom.us/s/84500000103'` |
| `password` | `VARCHAR(50)` | — | Non | Mot de passe de la réunion. | `'cS9tU3'` |
| `start_time` | `DATETIME` | — | Non | Début effectif de la téléconsultation. | `'2026-11-18 10:30:00'` |
| `status` | `ENUM('PENDING','APPROVED','REJECTED','COMPLETED','CANCELLED')` | ENUM, index | Oui (défaut `'PENDING'`) | État de la demande dans le circuit de validation. | `'APPROVED'` |
| `rejection_reason` | `VARCHAR(500)` | — | Non | Motif du refus, communiqué au demandeur. | `'Créneau indisponible'` |
| `requested_by` | `INT UNSIGNED` | FK → `users.id` (`RESTRICT`) | Oui | Utilisateur à l'origine de la demande (patient, soignant ou secrétariat). | `34` |
| `approved_by` | `INT UNSIGNED` | FK → `users.id` (`SET NULL`) | Non | Utilisateur ayant approuvé ou refusé la demande. | `1` |
| `created_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de création de la demande. | `'2026-11-17 09:00:00'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification (changement de statut, saisie des liens Zoom). | `'2026-11-17 11:30:00'` |

---

## 23. `lab_tests` — catalogue d'analyses *(module optionnel « bonus »)*

**Clé primaire** : `id` · **Unicités** : `uq_lab_tests_name` · **CHECK** : `chk_lab_tests_price`

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de l'analyse au catalogue. | `1` |
| `name` | `VARCHAR(120)` | UNIQUE (`uq_lab_tests_name`) | Oui | Nom de l'examen prescriptible. | `'Numération formule sanguine'` |
| `category` | `VARCHAR(80)` | — | Oui | Catégorie de l'examen (hématologie, biochimie, imagerie…). | `'Hématologie'` |
| `price` | `DECIMAL(10,2)` | CHECK `chk_lab_tests_price` (`>= 0`) | Oui (défaut `0.00`) | Tarif de l'examen, reporté sur la facture. | `18.00` |
| `turnaround_hours` | `SMALLINT UNSIGNED` | — | Oui (défaut `24`) | Délai de rendu annoncé au patient, en heures. | `24` |

---

## 24. `lab_requests` — demandes d'analyse *(module optionnel « bonus »)*

**Clé primaire** : `id` · **Index** : `idx_lab_requests_patient`, `idx_lab_requests_doctor`, `idx_lab_requests_status` · **FK** : `patients` (`CASCADE`), `doctors` (`RESTRICT`), `lab_tests` (`RESTRICT`)

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de la demande d'analyse. | `1` |
| `patient_id` | `INT UNSIGNED` | FK → `patients.id` (`CASCADE`), index composite | Oui | Patient concerné par l'examen. | `8` |
| `doctor_id` | `INT UNSIGNED` | FK → `doctors.id` (`RESTRICT`), index | Oui | Médecin prescripteur. | `1` |
| `lab_test_id` | `INT UNSIGNED` | FK → `lab_tests.id` (`RESTRICT`) | Oui | Examen demandé. | `1` |
| `status` | `ENUM('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')` | ENUM, index | Oui (défaut `'PENDING'`) | État d'avancement de l'analyse au laboratoire. | `'COMPLETED'` |
| `notes` | `VARCHAR(500)` | — | Non | Contexte clinique transmis au laboratoire. | `'Bilan demandé à l'issue de la consultation'` |
| `result_text` | `TEXT` | — | Non | Résultat de l'analyse, saisi par le laboratoire. | `'Résultats dans les valeurs de référence. Aucune anomalie détectée.'` |
| `requested_at` | `DATETIME` | Index composite | Oui (défaut `CURRENT_TIMESTAMP`) | Date de prescription de l'examen. | `'2026-11-10 10:35:00'` |
| `completed_at` | `DATETIME` | — | Non | Date de rendu du résultat. | `'2026-11-12 10:35:00'` |

---

## 25. `audit_logs` — journal d'audit

**Clé primaire** : `id` (`BIGINT`) · **Index** : `idx_audit_user`, `idx_audit_resource`, `idx_audit_action`, `idx_audit_created` · **FK** : `users` (`ON DELETE SET NULL`)

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de l'entrée d'audit ; 64 bits car c'est la table la plus volumineuse. | `1` |
| `user_id` | `INT UNSIGNED` | FK → `users.id` (`SET NULL`), index composite | Non | Auteur de l'action. Passe à `NULL` si le compte est supprimé : **l'entrée d'audit est conservée**. | `1` |
| `action` | `VARCHAR(40)` | Index (`idx_audit_action`) | Oui | Action journalisée, alignée sur `AUDIT_ACTIONS` (`CREATE`, `LOGIN_SUCCESS`, `DISPENSE`, `STOCK_ADJUST`…). | `'LOGIN_SUCCESS'` |
| `resource` | `VARCHAR(50)` | Index composite (`idx_audit_resource`) | Oui | Ressource concernée, alignée sur `PERMISSION_RESOURCES`. | `'auth'` |
| `resource_id` | `VARCHAR(40)` | Index composite | Non | Identifiant de l'enregistrement concerné, stocké en texte pour rester indépendant du type de clé. | `'1'` |
| `old_value` | `JSON` | — | Non | État de l'enregistrement **avant** la modification (snapshot JSON). | `'{"status":"PENDING"}'` |
| `new_value` | `JSON` | — | Non | État de l'enregistrement **après** la modification. | `'{"status":"APPROVED"}'` |
| `ip_address` | `VARCHAR(45)` | — | Non | Adresse IP de l'auteur de l'action. | `'192.168.1.24'` |
| `user_agent` | `VARCHAR(255)` | — | Non | Agent utilisateur du client, utile en cas d'investigation. | `'Mozilla/5.0 (Windows NT 10.0; Win64; x64)…'` |
| `created_at` | `DATETIME` | Index (`idx_audit_created`) | Oui (défaut `CURRENT_TIMESTAMP`) | Horodatage de l'action (base des rapports de conformité et de la purge). | `'2026-11-17 08:45:12'` |

---

## 26. `notifications` — notifications applicatives

**Clé primaire** : `id` · **Index** : `idx_notifications_user` · **FK** : `users` (`ON DELETE CASCADE`)

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | PK | Oui | Identifiant de la notification. | `1` |
| `user_id` | `INT UNSIGNED` | FK → `users.id` (`CASCADE`), index composite | Oui | Destinataire de la notification. | `1` |
| `title` | `VARCHAR(150)` | — | Oui | Titre court affiché dans la liste et la cloche de notification. | `'Nouvelle demande de téléconsultation'` |
| `message` | `VARCHAR(1000)` | — | Oui | Corps du message expliquant l'action attendue. | `'Une demande de téléconsultation attend votre validation.'` |
| `type` | `ENUM('INFO','SUCCESS','WARNING','ERROR')` | ENUM | Oui (défaut `'INFO'`) | Nature visuelle de la notification (couleur, icône). | `'INFO'` |
| `is_read` | `BOOLEAN` | Index composite | Oui (défaut `FALSE`) | Indique si l'utilisateur a pris connaissance du message. | `FALSE` |
| `link` | `VARCHAR(255)` | — | Non | Lien de navigation vers l'écran concerné, ex. `/admin/meetings`. | `'/admin/meetings'` |
| `created_at` | `DATETIME` | Index composite | Oui (défaut `CURRENT_TIMESTAMP`) | Date d'émission de la notification (tri décroissant d'affichage). | `'2026-11-17 09:00:00'` |

---

## 27. `clinic_settings` — paramètres de la clinique (singleton)

**Clé primaire** : `id` · **CHECK** : `chk_clinic_settings_singleton` (`id = 1`), `chk_clinic_settings_vat` (`vat_rate` entre 0 et 100)

| Colonne | Type | Contraintes | Obligatoire | Description métier | Exemple |
|---|---|---|---|---|---|
| `id` | `TINYINT UNSIGNED` | PK, CHECK `= 1` | Oui (défaut `1`) | Identifiant contraint à 1 : garantit qu'il n'existe qu'une seule ligne de paramètres. | `1` |
| `name` | `VARCHAR(120)` | — | Oui (défaut `'Clinique MediClinic'`) | Raison sociale imprimée en en-tête des documents. | `'Clinique MediClinic'` |
| `address` | `VARCHAR(255)` | — | Non | Adresse postale complète. | `'12 avenue de la Santé, 75015 Paris, France'` |
| `phone` | `VARCHAR(30)` | — | Non | Téléphone du standard, affiché sur les documents. | `'+33 1 45 67 89 00'` |
| `email` | `VARCHAR(190)` | — | Non | Courriel de contact public. | `'contact@mediclinic.fr'` |
| `currency` | `CHAR(3)` | — | Oui (défaut `'EUR'`) | Code devise ISO 4217 utilisé pour l'affichage des montants. | `'EUR'` |
| `vat_rate` | `DECIMAL(5,2)` | CHECK `chk_clinic_settings_vat` (0 à 100) | Oui (défaut `20.00`) | Taux de TVA par défaut proposé lors de la création d'une facture. | `20.00` |
| `logo_url` | `VARCHAR(500)` | — | Non | Chemin du logo utilisé dans les PDF et l'interface. | `'/static/logo-mediclinic.png'` |
| `zoom_account_id` | `VARCHAR(120)` | — | Non | Identifiant du compte Zoom de la clinique (intégration téléconsultation). | `'Zm9vYmFy'` |
| `zoom_client_id` | `VARCHAR(120)` | — | Non | Identifiant client de l'application Zoom (OAuth). | `'AbC123XyZ'` |
| `zoom_client_secret` | `VARCHAR(120)` | — | Non | Secret de l'application Zoom. **Donnée sensible** : accès restreint à `settings:read` / `settings:update`. | `'••••••••'` |
| `updated_at` | `DATETIME` | — | Oui (défaut `CURRENT_TIMESTAMP`) | Date de dernière modification des paramètres (pas de `created_at` : ligne unique). | `'2026-04-02 11:20:00'` |

---

## 28. Énumérations (`ENUM`) et valeurs autorisées

Les 13 colonnes `ENUM` de la base sont **strictement alignées** sur
`packages/shared/src/constants.ts` : toute valeur présente en base doit exister dans les
constantes partagées, et réciproquement (règle de maintenance du [`README.md`](README.md)
§5).

### 28.1 Liste complète

| # | Table | Colonne | Constante source | Valeurs autorisées | Libellés français |
|---|---|---|---|---|---|
| 1 | `patients` | `gender` | `GENDERS` | `MALE`, `FEMALE`, `OTHER` | Homme, Femme, Autre |
| 2 | `patients` | `blood_group` | `BLOOD_GROUPS` | `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-` | — (groupes sanguins) |
| 3 | `appointments` | `status` | `APPOINTMENT_STATUSES` | `PENDING`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW` | En attente, Confirmé, Arrivé, En cours, Terminé, Annulé, Absent |
| 4 | `appointments` | `type` | `APPOINTMENT_TYPES` | `IN_PERSON`, `TELEMEDICINE` | Présentiel, Téléconsultation |
| 5 | `prescriptions` | `status` | `PRESCRIPTION_STATUSES` | `ISSUED`, `DISPENSED`, `CANCELLED` | Émise, Dispensée, Annulée |
| 6 | `stock_movements` | `type` | `STOCK_MOVEMENT_TYPES` | `IN`, `OUT` | Entrée, Sortie |
| 7 | `invoices` | `status` | `INVOICE_STATUSES` | `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `CANCELLED` | Brouillon, Émise, Partiellement payée, Payée, Annulée |
| 8 | `payments` | `method` | `PAYMENT_METHODS` | `CASH`, `CARD`, `TRANSFER`, `INSURANCE`, `CHEQUE` | Espèces, Carte bancaire, Virement, Assurance, Chèque |
| 9 | `shifts` | `type` | `SHIFT_TYPES` | `DAY`, `NIGHT`, `ON_CALL` | Jour, Nuit, Astreinte |
| 10 | `shifts` | `status` | `SHIFT_STATUSES` | `SCHEDULED`, `CONFIRMED`, `COMPLETED`, `CANCELLED` | Planifiée, Confirmée, Effectuée, Annulée |
| 11 | `meetings` | `status` | `MEETING_STATUSES` | `PENDING`, `APPROVED`, `REJECTED`, `COMPLETED`, `CANCELLED` | En attente, Approuvée, Refusée, Terminée, Annulée |
| 12 | `lab_requests` | `status` | `LAB_REQUEST_STATUSES` | `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` | En attente, En cours, Résultat disponible, Annulée |
| 13 | `notifications` | `type` | `NOTIFICATION_TYPES` | `INFO`, `SUCCESS`, `WARNING`, `ERROR` | — (types d'interface) |

### 28.2 Domaines contraints hors `ENUM`

Certaines colonnes ont un domaine fermé mais exprimé par une contrainte `CHECK` ou une
liste de constantes plutôt que par un `ENUM` :

| Table | Colonne | Contrainte | Valeurs ou règles | Constante source |
|---|---|---|---|---|
| `permissions` | `action` | `chk_permissions_action` | `create`, `read`, `update`, `delete`, `manage` | `PERMISSION_ACTIONS` |
| `permissions` | `resource` | *(pas de contrainte SQL)* | 21 ressources contrôlées : `patient`, `doctor`, `specialty`, `department`, `appointment`, `consultation`, `prescription`, `medication`, `stock`, `invoice`, `payment`, `shift`, `meeting`, `lab`, `audit`, `role`, `user`, `dashboard`, `report`, `notification`, `settings` | `PERMISSION_RESOURCES` |
| `audit_logs` | `action` | *(pas de contrainte SQL)* | 11 actions : `CREATE`, `UPDATE`, `DELETE`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `APPROVE`, `REJECT`, `PDF_ACCESS`, `DISPENSE`, `STOCK_ADJUST` | `AUDIT_ACTIONS` |
| `roles` | `code` | *(pas de contrainte SQL)* | 8 rôles prédéfinis : `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `NURSE`, `PHARMACIST`, `RECEPTIONIST`, `ACCOUNTANT`, `PATIENT` — des rôles personnalisés restent créables | `ROLES` |
| `notifications` | `link` | *(pas de contrainte SQL)* | Routes de l'interface, commençant par `/` | — |

> **Pourquoi ne pas avoir utilisé `ENUM` partout ?** Sur `permissions.resource` et
> `audit_logs.action`, le domaine doit pouvoir s'étendre **sans migration de schéma**
> (ajout d'une ressource, d'une action d'audit). Un `ENUM` figerait la liste et
> imposerait un `ALTER TABLE` à chaque évolution : le contrôle est donc assuré par la
> couche applicative (constantes TypeScript) et validé par les tests. À l'inverse, les
> 13 colonnes énumérées au §28.1 correspondent à des cycles de vie **stables**, où
> l'`ENUM` apporte une garantie forte au niveau du SGBD.

---

## 29. Synthèse et contrôles

### 29.1 Statistiques du dictionnaire

| Indicateur | Valeur |
|---|---|
| Tables décrites | **26** |
| Colonnes décrites | **231** |
| Colonnes `NOT NULL` (obligatoires) | **163** |
| Colonnes nullables | **67** |
| Colonnes générées (non inscriptibles) | **1** (`invoice_items.line_total`) |
| Colonnes dérivées maintenues par trigger | **5** (`medications.stock_quantity`, `invoices.subtotal`, `invoices.vat_amount`, `invoices.total_amount`, `invoices.paid_amount`) |
| Colonnes `ENUM` | **13** |
| Colonnes `TEXT` | **7** (`patients.allergies`, `patients.medical_history`, `consultations.diagnosis`, `consultations.notes`, `doctors.bio`, `appointments.notes`, `lab_requests.result_text`) |
| Colonnes `JSON` | **2** (`audit_logs.old_value`, `audit_logs.new_value`) |
| Colonnes de montant `DECIMAL` | **12** (`doctors.consultation_fee`, `medications.price`, les 5 montants d'`invoices`, `invoice_items.unit_price`, `invoice_items.line_total`, `payments.amount`, `lab_tests.price`, `clinic_settings.vat_rate`) |
| Colonnes techniques de traçabilité (`created_at`, `updated_at`) | **32** (19 `created_at` + 13 `updated_at`) |

### 29.2 Règles d'utilisation à l'attention des développeurs

| Règle | Détail |
|---|---|
| **Ne jamais écrire une colonne dérivée** | `stock_quantity`, `subtotal`, `vat_amount`, `total_amount`, `paid_amount` et `line_total` sont calculées ou maintenues par les triggers et le SGBD. Toute écriture directe serait écrasée ou provoquerait une erreur. |
| **Ne jamais écrire `line_total`** | Colonne générée `STORED` : un `INSERT` qui la mentionne échoue avec une erreur MySQL. |
| **Utiliser les vues pour la lecture** | `v_appointment_details`, `v_invoice_details`, `v_doctor_directory`… évitent de dupliquer les jointures et empêchent l'exposition de `users.password_hash`. |
| **Filtrer `v_patient_history`** | Toujours fournir `WHERE patient_id = ?` : la vue est un `UNION ALL` sans filtre interne. |
| **Respecter les domaines d'`ENUM`** | Toute valeur écrite doit appartenir à la liste du §28.1 ; les tests partagés comparent la base et `constants.ts`. |
| **Préférer la désactivation à la suppression** | `users.is_active = FALSE` préserve l'intégrité des journaux (stock, paiements, audit) protégés par `ON DELETE RESTRICT`. |
| **Vérifier les colonnes obligatoires avant un `INSERT`** | Les colonnes sans valeur par défaut et `NOT NULL` doivent être fournies : voir la colonne « Obligatoire » de chaque fiche. |
| **Dates au format `AAAA-MM-JJ HH:MM:SS`** | `DATETIME` MySQL n'accepte pas les formats localisés ; les conversions sont faites par la couche applicative (`packages/shared/src/formatters.ts`). |

### 29.3 Contrôles de cohérence

| Contrôle | Résultat |
|---|---|
| Chaque table physique est décrite | ✅ 26 / 26 (§2 à §27) |
| Chaque colonne physique est décrite | ✅ 231 / 231 |
| Chaque clé étrangère est décrite avec sa cible | ✅ 41 / 41 |
| Chaque contrainte `CHECK` est décrite | ✅ 18 / 18 |
| Chaque `ENUM` est aligné sur `packages/shared/src/constants.ts` | ✅ 13 / 13 (§28.1) |
| Chaque colonne dérivée est signalée comme non inscriptible | ✅ 6 / 6 |
| Les exemples sont cohérents avec le jeu de démonstration | ✅ `database/migrations/003_seed.sql` |

---

*Fin du dictionnaire de données — voir aussi l'[analyse de normalisation](../../docs/BCNF.md).*
