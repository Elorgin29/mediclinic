-- =============================================================================
--  MediClinic — 001_init.sql
--  Création de la base de données, des tables, des index, des contraintes
--  d'intégrité référentielle et des triggers métier.
--
--  SGBD cible : MySQL 8.0+ (InnoDB, utf8mb4)
--  Encodage   : utf8mb4 / utf8mb4_unicode_ci
--
--  NOTES DE MODÉLISATION (voir docs/BCNF.md pour la justification complète) :
--   * users ne porte PAS de colonne role_id : la relation User–Role est N-N
--     (table user_roles), ce qui est nécessaire pour le RBAC modulaire et
--     supprime la dépendance fonctionnelle partielle introduite par role_id.
--   * consultations ne porte PAS de colonne prescription_id : la relation
--     Consultation–Prescription est portée par prescriptions.consultation_id,
--     ce qui évite une dépendance circulaire et donc une redondance.
--   * La génération de données est déléguée aux scripts 002_views.sql et
--     003_seed.sql, exécutés après ce fichier.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Base de données
-- -----------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `mediclinic`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `mediclinic`;

-- Les triggers utilisent des délimiteurs personnalisés.
DELIMITER $$

-- On supprime d'abord les triggers pour rendre le script rejouable.
DROP TRIGGER IF EXISTS trg_stock_movement_before_insert $$
DROP TRIGGER IF EXISTS trg_stock_movement_after_insert $$
DROP TRIGGER IF EXISTS trg_stock_movement_after_delete $$
DROP TRIGGER IF EXISTS trg_invoice_item_after_insert $$
DROP TRIGGER IF EXISTS trg_invoice_item_after_update $$
DROP TRIGGER IF EXISTS trg_invoice_item_after_delete $$
DROP TRIGGER IF EXISTS trg_invoice_before_update $$
DROP TRIGGER IF EXISTS trg_payment_after_insert $$
DROP TRIGGER IF EXISTS trg_payment_after_update $$
DROP TRIGGER IF EXISTS trg_payment_after_delete $$

DELIMITER ;

-- On supprime les tables dans l'ordre inverse des dépendances (script rejouable).
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `refresh_tokens`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `clinic_settings`;
DROP TABLE IF EXISTS `lab_requests`;
DROP TABLE IF EXISTS `lab_tests`;
DROP TABLE IF EXISTS `meetings`;
DROP TABLE IF EXISTS `shifts`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `invoice_items`;
DROP TABLE IF EXISTS `invoices`;
DROP TABLE IF EXISTS `stock_movements`;
DROP TABLE IF EXISTS `prescription_items`;
DROP TABLE IF EXISTS `prescriptions`;
DROP TABLE IF EXISTS `consultations`;
DROP TABLE IF EXISTS `appointments`;
DROP TABLE IF EXISTS `medications`;
DROP TABLE IF EXISTS `doctors`;
DROP TABLE IF EXISTS `departments`;
DROP TABLE IF EXISTS `specialties`;
DROP TABLE IF EXISTS `patients`;
DROP TABLE IF EXISTS `user_roles`;
DROP TABLE IF EXISTS `role_permissions`;
DROP TABLE IF EXISTS `permissions`;
DROP TABLE IF EXISTS `roles`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- 1. RBAC MODULAIRE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- roles : rôles applicatifs (prédéfinis + personnalisés créés par l'admin)
-- -----------------------------------------------------------------------------
CREATE TABLE `roles` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(50)  NOT NULL COMMENT 'Code technique, ex. DOCTOR',
  `name`        VARCHAR(80)  NOT NULL COMMENT 'Libellé affiché',
  `description` VARCHAR(255) NULL,
  `is_system`   BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'Rôle non supprimable',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_code` (`code`),
  UNIQUE KEY `uq_roles_name` (`name`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- permissions : permissions atomiques nommées resource:action
-- -----------------------------------------------------------------------------
CREATE TABLE `permissions` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(80)  NOT NULL COMMENT 'ex. patient:create',
  `resource`    VARCHAR(50)  NOT NULL COMMENT 'ex. patient',
  `action`      VARCHAR(20)  NOT NULL COMMENT 'create|read|update|delete|manage',
  `description` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_code` (`code`),
  KEY `idx_permissions_resource` (`resource`),
  CONSTRAINT `chk_permissions_action`
    CHECK (`action` IN ('create', 'read', 'update', 'delete', 'manage'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- role_permissions : association N-N Role × Permission
-- -----------------------------------------------------------------------------
CREATE TABLE `role_permissions` (
  `role_id`       INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `idx_role_permissions_permission` (`permission_id`),
  CONSTRAINT `fk_role_permissions_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_role_permissions_permission`
    FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- 2. UTILISATEURS & PATIENTS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users : compte d'authentification (staff ou patient)
-- -----------------------------------------------------------------------------
CREATE TABLE `users` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`         VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'bcrypt, 12 rounds',
  `first_name`    VARCHAR(80)  NOT NULL,
  `last_name`     VARCHAR(80)  NOT NULL,
  `phone`         VARCHAR(30)  NULL,
  `is_active`     BOOLEAN      NOT NULL DEFAULT TRUE,
  `last_login_at` DATETIME     NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_active` (`is_active`),
  KEY `idx_users_name` (`last_name`, `first_name`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- user_roles : association N-N User × Role
-- -----------------------------------------------------------------------------
CREATE TABLE `user_roles` (
  `user_id`    INT UNSIGNED NOT NULL,
  `role_id`    INT UNSIGNED NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `role_id`),
  KEY `idx_user_roles_role` (`role_id`),
  CONSTRAINT `fk_user_roles_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_roles_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- refresh_tokens : jetons de rafraîchissement (rotation + révocation)
-- -----------------------------------------------------------------------------
CREATE TABLE `refresh_tokens` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `token_hash` CHAR(64)     NOT NULL COMMENT 'SHA-256 du jeton (jamais en clair)',
  `expires_at` DATETIME     NOT NULL,
  `revoked_at` DATETIME     NULL,
  `user_agent` VARCHAR(255) NULL,
  `ip_address` VARCHAR(45)  NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refresh_tokens_hash` (`token_hash`),
  KEY `idx_refresh_tokens_user` (`user_id`, `expires_at`),
  CONSTRAINT `fk_refresh_tokens_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- patients : dossier administratif et médical de base
-- user_id est nullable : un patient peut exister sans compte en ligne
-- (créé au secrétariat), et un compte peut exister sans dossier (staff).
-- -----------------------------------------------------------------------------
CREATE TABLE `patients` (
  `id`                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`                 INT UNSIGNED NULL,
  `first_name`              VARCHAR(80)  NOT NULL,
  `last_name`               VARCHAR(80)  NOT NULL,
  `birth_date`              DATE         NOT NULL,
  `gender`                  ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL,
  `address`                 VARCHAR(255) NULL,
  `city`                    VARCHAR(80)  NULL,
  `postal_code`             VARCHAR(10)  NULL,
  `phone`                   VARCHAR(30)  NULL,
  `email`                   VARCHAR(190) NULL,
  `blood_group`             ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NULL,
  `allergies`               TEXT         NULL,
  `medical_history`         TEXT         NULL,
  `emergency_contact_name`  VARCHAR(120) NULL,
  `emergency_contact_phone` VARCHAR(30)  NULL,
  `insurance_number`        VARCHAR(50)  NULL,
  `created_at`              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_patients_user` (`user_id`),
  UNIQUE KEY `uq_patients_insurance` (`insurance_number`),
  KEY `idx_patients_name` (`last_name`, `first_name`),
  KEY `idx_patients_email` (`email`),
  KEY `idx_patients_phone` (`phone`),
  CONSTRAINT `fk_patients_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_patients_birth`
    CHECK (`birth_date` >= '1900-01-01')
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- 3. ORGANISATION MÉDICALE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- specialties : spécialités médicales
-- -----------------------------------------------------------------------------
CREATE TABLE `specialties` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(80)  NOT NULL,
  `description` VARCHAR(500) NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_specialties_name` (`name`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- departments : départements de la clinique
-- head_doctor_id pointe vers doctors ; la FK est ajoutée après doctors pour
-- rompre le cycle de création. ON DELETE SET NULL conserve le département.
-- -----------------------------------------------------------------------------
CREATE TABLE `departments` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`           VARCHAR(80)  NOT NULL,
  `description`    VARCHAR(500) NULL,
  `head_doctor_id` INT UNSIGNED NULL,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_departments_name` (`name`),
  KEY `idx_departments_head` (`head_doctor_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- doctors : profil médecin rattaché à un compte utilisateur
-- -----------------------------------------------------------------------------
CREATE TABLE `doctors` (
  `id`                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`               INT UNSIGNED  NOT NULL,
  `specialty_id`          INT UNSIGNED  NOT NULL,
  `department_id`         INT UNSIGNED  NULL,
  `license_number`        VARCHAR(50)   NOT NULL COMMENT 'Numéro d’ordre des médecins',
  `consultation_fee`      DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
  `bio`                   TEXT          NULL,
  `is_accepting_patients` BOOLEAN       NOT NULL DEFAULT TRUE,
  `created_at`            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_doctors_user` (`user_id`),
  UNIQUE KEY `uq_doctors_license` (`license_number`),
  KEY `idx_doctors_specialty` (`specialty_id`),
  KEY `idx_doctors_department` (`department_id`),
  CONSTRAINT `fk_doctors_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_doctors_specialty`
    FOREIGN KEY (`specialty_id`) REFERENCES `specialties` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_doctors_department`
    FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_doctors_fee`
    CHECK (`consultation_fee` >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- FK différée : departments.head_doctor_id -> doctors.id
ALTER TABLE `departments`
  ADD CONSTRAINT `fk_departments_head_doctor`
    FOREIGN KEY (`head_doctor_id`) REFERENCES `doctors` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- 4. RENDEZ-VOUS & CONSULTATIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- appointments : rendez-vous (présentiel ou téléconsultation)
-- -----------------------------------------------------------------------------
CREATE TABLE `appointments` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `patient_id`    INT UNSIGNED NOT NULL,
  `doctor_id`     INT UNSIGNED NOT NULL,
  `department_id` INT UNSIGNED NULL,
  `scheduled_at`  DATETIME     NOT NULL,
  `duration`      SMALLINT UNSIGNED NOT NULL DEFAULT 30 COMMENT 'Durée en minutes',
  `status`        ENUM('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED',
                       'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING',
  `type`          ENUM('IN_PERSON', 'TELEMEDICINE') NOT NULL DEFAULT 'IN_PERSON',
  `reason`        VARCHAR(500) NULL,
  `notes`         TEXT         NULL,
  `cancelled_reason` VARCHAR(500) NULL,
  `created_by`    INT UNSIGNED NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_appointments_patient` (`patient_id`, `scheduled_at`),
  KEY `idx_appointments_doctor` (`doctor_id`, `scheduled_at`),
  KEY `idx_appointments_status` (`status`),
  KEY `idx_appointments_scheduled` (`scheduled_at`),
  KEY `idx_appointments_department` (`department_id`),
  CONSTRAINT `fk_appointments_patient`
    FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_appointments_doctor`
    FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_appointments_department`
    FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_appointments_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_appointments_duration`
    CHECK (`duration` BETWEEN 10 AND 240)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- consultations : compte-rendu rattaché à un rendez-vous (1–1)
-- La colonne prescription_id du modèle initial a été retirée : la relation
-- est portée par prescriptions.consultation_id (cf. docs/BCNF.md).
-- -----------------------------------------------------------------------------
CREATE TABLE `consultations` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `appointment_id` INT UNSIGNED NOT NULL,
  `doctor_id`      INT UNSIGNED NOT NULL,
  `diagnosis`      TEXT         NOT NULL,
  `notes`          TEXT         NULL,
  `follow_up_at`   DATE         NULL,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_consultations_appointment` (`appointment_id`),
  KEY `idx_consultations_doctor` (`doctor_id`, `created_at`),
  CONSTRAINT `fk_consultations_appointment`
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_consultations_doctor`
    FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- prescriptions : ordonnance émise lors d'une consultation
-- -----------------------------------------------------------------------------
CREATE TABLE `prescriptions` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `consultation_id` INT UNSIGNED NOT NULL,
  `doctor_id`       INT UNSIGNED NOT NULL,
  `issued_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status`          ENUM('ISSUED', 'DISPENSED', 'CANCELLED') NOT NULL DEFAULT 'ISSUED',
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_prescriptions_consultation` (`consultation_id`),
  KEY `idx_prescriptions_doctor` (`doctor_id`),
  KEY `idx_prescriptions_status` (`status`),
  CONSTRAINT `fk_prescriptions_consultation`
    FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_prescriptions_doctor`
    FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- 5. PHARMACIE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- medications : catalogue et stock courant
-- -----------------------------------------------------------------------------
CREATE TABLE `medications` (
  `id`              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `name`            VARCHAR(120)  NOT NULL,
  `category`        VARCHAR(80)   NOT NULL,
  `unit`            VARCHAR(30)   NOT NULL COMMENT 'ex. comprimé, flacon, boîte',
  `price`           DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `stock_quantity`  INT           NOT NULL DEFAULT 0 COMMENT 'Maintenu par trigger',
  `alert_threshold` INT           NOT NULL DEFAULT 10,
  `expiry_date`     DATE          NULL,
  `supplier`        VARCHAR(120)  NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_medications_name_unit` (`name`, `unit`),
  KEY `idx_medications_category` (`category`),
  KEY `idx_medications_expiry` (`expiry_date`),
  KEY `idx_medications_stock` (`stock_quantity`),
  CONSTRAINT `chk_medications_price` CHECK (`price` >= 0),
  CONSTRAINT `chk_medications_stock` CHECK (`stock_quantity` >= 0),
  CONSTRAINT `chk_medications_threshold` CHECK (`alert_threshold` >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- prescription_items : lignes d'ordonnance
-- -----------------------------------------------------------------------------
CREATE TABLE `prescription_items` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `prescription_id` INT UNSIGNED NOT NULL,
  `medication_id`   INT UNSIGNED NOT NULL,
  `dosage`          VARCHAR(120) NOT NULL,
  `frequency`       VARCHAR(120) NOT NULL,
  `duration`        VARCHAR(120) NOT NULL,
  `instructions`    VARCHAR(500) NULL,
  `quantity`        INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_prescription_items_prescription` (`prescription_id`),
  KEY `idx_prescription_items_medication` (`medication_id`),
  CONSTRAINT `fk_prescription_items_prescription`
    FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_prescription_items_medication`
    FOREIGN KEY (`medication_id`) REFERENCES `medications` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_prescription_items_quantity` CHECK (`quantity` >= 1)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- stock_movements : journal des entrées/sorties de stock
-- La colonne medications.stock_quantity est synchronisée par trigger :
-- elle n'est jamais modifiée directement par l'application.
-- -----------------------------------------------------------------------------
CREATE TABLE `stock_movements` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `medication_id` INT UNSIGNED NOT NULL,
  `type`          ENUM('IN', 'OUT') NOT NULL,
  `quantity`      INT UNSIGNED NOT NULL,
  `reason`        VARCHAR(255) NOT NULL,
  `user_id`       INT UNSIGNED NOT NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stock_movements_medication` (`medication_id`, `created_at`),
  KEY `idx_stock_movements_user` (`user_id`),
  KEY `idx_stock_movements_type` (`type`),
  CONSTRAINT `fk_stock_movements_medication`
    FOREIGN KEY (`medication_id`) REFERENCES `medications` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_stock_movements_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_stock_movements_quantity` CHECK (`quantity` >= 1)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- 6. FACTURATION
-- =============================================================================

-- -----------------------------------------------------------------------------
-- invoices : facture patient
-- subtotal / vat_amount / total_amount sont recalculés par trigger à partir
-- des lignes, afin d'éviter toute désynchronisation.
-- -----------------------------------------------------------------------------
CREATE TABLE `invoices` (
  `id`              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `number`          VARCHAR(30)   NOT NULL COMMENT 'ex. FAC-2026-000123',
  `patient_id`      INT UNSIGNED  NOT NULL,
  `consultation_id` INT UNSIGNED  NULL,
  `subtotal`        DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `vat_rate`        DECIMAL(5, 2) NOT NULL DEFAULT 20.00,
  `vat_amount`      DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `total_amount`    DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `paid_amount`     DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `status`          ENUM('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')
                    NOT NULL DEFAULT 'DRAFT',
  `issued_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `due_date`        DATE          NOT NULL,
  `created_by`      INT UNSIGNED  NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoices_number` (`number`),
  KEY `idx_invoices_patient` (`patient_id`, `issued_at`),
  KEY `idx_invoices_status` (`status`),
  KEY `idx_invoices_issued` (`issued_at`),
  KEY `idx_invoices_consultation` (`consultation_id`),
  CONSTRAINT `fk_invoices_patient`
    FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_invoices_consultation`
    FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_invoices_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_invoices_totals` CHECK (
    `subtotal` >= 0 AND `vat_rate` >= 0 AND `vat_amount` >= 0
    AND `total_amount` >= 0 AND `paid_amount` >= 0
  )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- invoice_items : lignes de facture
-- line_total est une colonne générée : elle ne peut pas être incohérente.
-- -----------------------------------------------------------------------------
CREATE TABLE `invoice_items` (
  `id`         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `invoice_id` INT UNSIGNED  NOT NULL,
  `label`      VARCHAR(200)  NOT NULL,
  `quantity`   INT UNSIGNED  NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `line_total` DECIMAL(12, 2) AS (`quantity` * `unit_price`) STORED,
  PRIMARY KEY (`id`),
  KEY `idx_invoice_items_invoice` (`invoice_id`),
  CONSTRAINT `fk_invoice_items_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_invoice_items_quantity` CHECK (`quantity` >= 1),
  CONSTRAINT `chk_invoice_items_price` CHECK (`unit_price` >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- payments : encaissements (partiels ou totaux)
-- -----------------------------------------------------------------------------
CREATE TABLE `payments` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `invoice_id`  INT UNSIGNED  NOT NULL,
  `amount`      DECIMAL(12, 2) NOT NULL,
  `method`      ENUM('CASH', 'CARD', 'TRANSFER', 'INSURANCE', 'CHEQUE') NOT NULL,
  `paid_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reference`   VARCHAR(120)  NULL,
  `recorded_by` INT UNSIGNED  NOT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payments_invoice` (`invoice_id`, `paid_at`),
  KEY `idx_payments_paid_at` (`paid_at`),
  CONSTRAINT `fk_payments_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_user`
    FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_payments_amount` CHECK (`amount` > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- 7. RESSOURCES HUMAINES — GARDES
-- =============================================================================

CREATE TABLE `shifts` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `doctor_id`     INT UNSIGNED NOT NULL,
  `department_id` INT UNSIGNED NOT NULL,
  `start_at`      DATETIME     NOT NULL,
  `end_at`        DATETIME     NOT NULL,
  `type`          ENUM('DAY', 'NIGHT', 'ON_CALL') NOT NULL DEFAULT 'DAY',
  `status`        ENUM('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  `notes`         VARCHAR(500) NULL,
  `created_by`    INT UNSIGNED NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_shifts_doctor` (`doctor_id`, `start_at`),
  KEY `idx_shifts_department` (`department_id`, `start_at`),
  KEY `idx_shifts_period` (`start_at`, `end_at`),
  CONSTRAINT `fk_shifts_doctor`
    FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_shifts_department`
    FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_shifts_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_shifts_dates` CHECK (`end_at` > `start_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- 8. TÉLÉCONSULTATION (ZOOM)
-- =============================================================================

CREATE TABLE `meetings` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `appointment_id`   INT UNSIGNED NULL,
  `patient_id`       INT UNSIGNED NOT NULL,
  `doctor_id`        INT UNSIGNED NOT NULL,
  `reason`           VARCHAR(500) NOT NULL,
  `preferred_at`     DATETIME     NOT NULL,
  `duration`         SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  `zoom_meeting_id`  VARCHAR(50)  NULL,
  `join_url`         VARCHAR(500) NULL,
  `start_url`        VARCHAR(500) NULL,
  `password`         VARCHAR(50)  NULL,
  `start_time`       DATETIME     NULL,
  `status`           ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED')
                     NOT NULL DEFAULT 'PENDING',
  `rejection_reason` VARCHAR(500) NULL,
  `requested_by`     INT UNSIGNED NOT NULL,
  `approved_by`      INT UNSIGNED NULL,
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_meetings_appointment` (`appointment_id`),
  KEY `idx_meetings_patient` (`patient_id`, `created_at`),
  KEY `idx_meetings_doctor` (`doctor_id`, `start_time`),
  KEY `idx_meetings_status` (`status`),
  CONSTRAINT `fk_meetings_appointment`
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_meetings_patient`
    FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_meetings_doctor`
    FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_meetings_requested_by`
    FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_meetings_approved_by`
    FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_meetings_duration` CHECK (`duration` BETWEEN 10 AND 240)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- 9. LABORATOIRE (bonus)
-- =============================================================================

CREATE TABLE `lab_tests` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `name`             VARCHAR(120)  NOT NULL,
  `category`         VARCHAR(80)   NOT NULL,
  `price`            DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `turnaround_hours` SMALLINT UNSIGNED NOT NULL DEFAULT 24,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lab_tests_name` (`name`),
  CONSTRAINT `chk_lab_tests_price` CHECK (`price` >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `lab_requests` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `patient_id`   INT UNSIGNED NOT NULL,
  `doctor_id`    INT UNSIGNED NOT NULL,
  `lab_test_id`  INT UNSIGNED NOT NULL,
  `status`       ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `notes`        VARCHAR(500) NULL,
  `result_text`  TEXT         NULL,
  `requested_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` DATETIME     NULL,
  PRIMARY KEY (`id`),
  KEY `idx_lab_requests_patient` (`patient_id`, `requested_at`),
  KEY `idx_lab_requests_doctor` (`doctor_id`),
  KEY `idx_lab_requests_status` (`status`),
  CONSTRAINT `fk_lab_requests_patient`
    FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_lab_requests_doctor`
    FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_lab_requests_test`
    FOREIGN KEY (`lab_test_id`) REFERENCES `lab_tests` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- 10. AUDIT, NOTIFICATIONS, PARAMÈTRES
-- =============================================================================

CREATE TABLE `audit_logs` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED NULL,
  `action`      VARCHAR(40)  NOT NULL,
  `resource`    VARCHAR(50)  NOT NULL,
  `resource_id` VARCHAR(40)  NULL,
  `old_value`   JSON         NULL,
  `new_value`   JSON         NULL,
  `ip_address`  VARCHAR(45)  NULL,
  `user_agent`  VARCHAR(255) NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_user` (`user_id`, `created_at`),
  KEY `idx_audit_resource` (`resource`, `resource_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_created` (`created_at`),
  CONSTRAINT `fk_audit_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `notifications` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `title`      VARCHAR(150) NOT NULL,
  `message`    VARCHAR(1000) NOT NULL,
  `type`       ENUM('INFO', 'SUCCESS', 'WARNING', 'ERROR') NOT NULL DEFAULT 'INFO',
  `is_read`    BOOLEAN      NOT NULL DEFAULT FALSE,
  `link`       VARCHAR(255) NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user` (`user_id`, `is_read`, `created_at`),
  CONSTRAINT `fk_notifications_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `clinic_settings` (
  `id`                TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `name`              VARCHAR(120) NOT NULL DEFAULT 'Clinique MediClinic',
  `address`           VARCHAR(255) NULL,
  `phone`             VARCHAR(30)  NULL,
  `email`             VARCHAR(190) NULL,
  `currency`          CHAR(3)      NOT NULL DEFAULT 'EUR',
  `vat_rate`          DECIMAL(5, 2) NOT NULL DEFAULT 20.00,
  `logo_url`          VARCHAR(500) NULL,
  `zoom_account_id`   VARCHAR(120) NULL,
  `zoom_client_id`    VARCHAR(120) NULL,
  `zoom_client_secret` VARCHAR(120) NULL,
  `updated_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_clinic_settings_singleton` CHECK (`id` = 1),
  CONSTRAINT `chk_clinic_settings_vat` CHECK (`vat_rate` BETWEEN 0 AND 100)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- 11. TRIGGERS MÉTIER
-- =============================================================================

DELIMITER $$

-- -----------------------------------------------------------------------------
-- T1/T2. Synchronisation du stock : stock_movements est la source de vérité.
--        Un mouvement OUT est refusé si le stock est insuffisant.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_stock_movement_before_insert
BEFORE INSERT ON `stock_movements`
FOR EACH ROW
BEGIN
  DECLARE v_stock INT;

  SELECT `stock_quantity` INTO v_stock
  FROM `medications`
  WHERE `id` = NEW.`medication_id`
  FOR UPDATE;

  IF v_stock IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Médicament introuvable pour ce mouvement de stock.';
  END IF;

  IF NEW.`type` = 'OUT' AND v_stock < NEW.`quantity` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stock insuffisant pour enregistrer cette sortie.';
  END IF;
END$$

CREATE TRIGGER trg_stock_movement_after_insert
AFTER INSERT ON `stock_movements`
FOR EACH ROW
BEGIN
  IF NEW.`type` = 'IN' THEN
    UPDATE `medications`
       SET `stock_quantity` = `stock_quantity` + NEW.`quantity`
     WHERE `id` = NEW.`medication_id`;
  ELSE
    UPDATE `medications`
       SET `stock_quantity` = `stock_quantity` - NEW.`quantity`
     WHERE `id` = NEW.`medication_id`;
  END IF;
END$$

-- Annulation d'un mouvement (correction d'erreur de saisie) : on rétablit le stock.
CREATE TRIGGER trg_stock_movement_after_delete
AFTER DELETE ON `stock_movements`
FOR EACH ROW
BEGIN
  IF OLD.`type` = 'IN' THEN
    UPDATE `medications`
       SET `stock_quantity` = `stock_quantity` - OLD.`quantity`
     WHERE `id` = OLD.`medication_id`;
  ELSE
    UPDATE `medications`
       SET `stock_quantity` = `stock_quantity` + OLD.`quantity`
     WHERE `id` = OLD.`medication_id`;
  END IF;
END$$

-- -----------------------------------------------------------------------------
-- T3. Recalcul des totaux de facture à partir des lignes.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_invoice_item_after_insert
AFTER INSERT ON `invoice_items`
FOR EACH ROW
BEGIN
  UPDATE `invoices`
     SET `subtotal`     = (SELECT COALESCE(SUM(`line_total`), 0)
                             FROM `invoice_items` WHERE `invoice_id` = NEW.`invoice_id`),
         `vat_amount`   = ROUND((SELECT COALESCE(SUM(`line_total`), 0)
                                   FROM `invoice_items` WHERE `invoice_id` = NEW.`invoice_id`)
                                * `vat_rate` / 100, 2),
         `total_amount` = ROUND((SELECT COALESCE(SUM(`line_total`), 0)
                                   FROM `invoice_items` WHERE `invoice_id` = NEW.`invoice_id`)
                                * (1 + `vat_rate` / 100), 2)
   WHERE `id` = NEW.`invoice_id`;
END$$

CREATE TRIGGER trg_invoice_item_after_update
AFTER UPDATE ON `invoice_items`
FOR EACH ROW
BEGIN
  UPDATE `invoices`
     SET `subtotal`     = (SELECT COALESCE(SUM(`line_total`), 0)
                             FROM `invoice_items` WHERE `invoice_id` = NEW.`invoice_id`),
         `vat_amount`   = ROUND((SELECT COALESCE(SUM(`line_total`), 0)
                                   FROM `invoice_items` WHERE `invoice_id` = NEW.`invoice_id`)
                                * `vat_rate` / 100, 2),
         `total_amount` = ROUND((SELECT COALESCE(SUM(`line_total`), 0)
                                   FROM `invoice_items` WHERE `invoice_id` = NEW.`invoice_id`)
                                * (1 + `vat_rate` / 100), 2)
   WHERE `id` = NEW.`invoice_id`;
END$$

CREATE TRIGGER trg_invoice_item_after_delete
AFTER DELETE ON `invoice_items`
FOR EACH ROW
BEGIN
  UPDATE `invoices`
     SET `subtotal`     = (SELECT COALESCE(SUM(`line_total`), 0)
                             FROM `invoice_items` WHERE `invoice_id` = OLD.`invoice_id`),
         `vat_amount`   = ROUND((SELECT COALESCE(SUM(`line_total`), 0)
                                   FROM `invoice_items` WHERE `invoice_id` = OLD.`invoice_id`)
                                * `vat_rate` / 100, 2),
         `total_amount` = ROUND((SELECT COALESCE(SUM(`line_total`), 0)
                                   FROM `invoice_items` WHERE `invoice_id` = OLD.`invoice_id`)
                                * (1 + `vat_rate` / 100), 2)
   WHERE `id` = OLD.`invoice_id`;
END$$

-- Modification du taux de TVA : recalcule les montants dérivés.
CREATE TRIGGER trg_invoice_before_update
BEFORE UPDATE ON `invoices`
FOR EACH ROW
BEGIN
  IF NEW.`vat_rate` <> OLD.`vat_rate` THEN
    SET NEW.`vat_amount`   = ROUND(NEW.`subtotal` * NEW.`vat_rate` / 100, 2);
    SET NEW.`total_amount` = ROUND(NEW.`subtotal` * (1 + NEW.`vat_rate` / 100), 2);
  END IF;
END$$

-- -----------------------------------------------------------------------------
-- T4. Mise à jour du montant payé et du statut à chaque encaissement.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_payment_after_insert
AFTER INSERT ON `payments`
FOR EACH ROW
BEGIN
  DECLARE v_paid  DECIMAL(12, 2);
  DECLARE v_total DECIMAL(12, 2);
  DECLARE v_status VARCHAR(20);

  SELECT COALESCE(SUM(`amount`), 0) INTO v_paid
  FROM `payments` WHERE `invoice_id` = NEW.`invoice_id`;

  SELECT `total_amount`, `status` INTO v_total, v_status
  FROM `invoices` WHERE `id` = NEW.`invoice_id`;

  IF v_status NOT IN ('DRAFT', 'CANCELLED') THEN
    UPDATE `invoices`
       SET `paid_amount` = v_paid,
           `status` = CASE
                        WHEN v_paid >= v_total THEN 'PAID'
                        WHEN v_paid > 0 THEN 'PARTIALLY_PAID'
                        ELSE 'ISSUED'
                      END
     WHERE `id` = NEW.`invoice_id`;
  ELSE
    UPDATE `invoices` SET `paid_amount` = v_paid WHERE `id` = NEW.`invoice_id`;
  END IF;
END$$

CREATE TRIGGER trg_payment_after_update
AFTER UPDATE ON `payments`
FOR EACH ROW
BEGIN
  DECLARE v_paid  DECIMAL(12, 2);
  DECLARE v_total DECIMAL(12, 2);
  DECLARE v_status VARCHAR(20);

  SELECT COALESCE(SUM(`amount`), 0) INTO v_paid
  FROM `payments` WHERE `invoice_id` = NEW.`invoice_id`;

  SELECT `total_amount`, `status` INTO v_total, v_status
  FROM `invoices` WHERE `id` = NEW.`invoice_id`;

  IF v_status NOT IN ('DRAFT', 'CANCELLED') THEN
    UPDATE `invoices`
       SET `paid_amount` = v_paid,
           `status` = CASE
                        WHEN v_paid >= v_total THEN 'PAID'
                        WHEN v_paid > 0 THEN 'PARTIALLY_PAID'
                        ELSE 'ISSUED'
                      END
     WHERE `id` = NEW.`invoice_id`;
  ELSE
    UPDATE `invoices` SET `paid_amount` = v_paid WHERE `id` = NEW.`invoice_id`;
  END IF;
END$$

CREATE TRIGGER trg_payment_after_delete
AFTER DELETE ON `payments`
FOR EACH ROW
BEGIN
  DECLARE v_paid  DECIMAL(12, 2);
  DECLARE v_total DECIMAL(12, 2);
  DECLARE v_status VARCHAR(20);

  SELECT COALESCE(SUM(`amount`), 0) INTO v_paid
  FROM `payments` WHERE `invoice_id` = OLD.`invoice_id`;

  SELECT `total_amount`, `status` INTO v_total, v_status
  FROM `invoices` WHERE `id` = OLD.`invoice_id`;

  IF v_status NOT IN ('DRAFT', 'CANCELLED') THEN
    UPDATE `invoices`
       SET `paid_amount` = v_paid,
           `status` = CASE
                        WHEN v_paid >= v_total THEN 'PAID'
                        WHEN v_paid > 0 THEN 'PARTIALLY_PAID'
                        ELSE 'ISSUED'
                      END
     WHERE `id` = OLD.`invoice_id`;
  ELSE
    UPDATE `invoices` SET `paid_amount` = v_paid WHERE `id` = OLD.`invoice_id`;
  END IF;
END$$

DELIMITER ;

-- =============================================================================
-- Fin de 001_init.sql
-- Étape suivante : 002_views.sql puis 003_seed.sql
-- =============================================================================
