-- =============================================================================
--  MediClinic — 003_seed.sql
--  Jeu de données de démonstration.
--
--  PRÉ-REQUIS : exécuter 001_init.sql puis 002_views.sql avant ce script.
--
--  Le script est REJOUABLE : il vide les tables métier avant de réinsérer.
--  Les dates sont calculées à partir de CURDATE() : le jeu de données reste
--  donc « frais » (rendez-vous passés, du jour et futurs) quelle que soit la
--  date d'exécution.
--
--  MOT DE PASSE DE TOUS LES COMPTES : Passw0rd!2026
--  (hachage bcrypt 12 rounds ci-dessous — identique pour tous les comptes)
--
--  VOLUMÉTRIE (conforme au cahier des charges) :
--    53 utilisateurs  : 3 admins, 8 médecins, 5 infirmiers, 2 pharmaciens,
--                       3 réceptionnistes, 2 comptables, 30 patients
--    8 rôles / 77 permissions / matrice role_permissions complète
--    10 spécialités, 8 départements, 8 médecins, 30 patients
--    20 médicaments + 40 mouvements de stock
--    50 rendez-vous répartis sur 3 mois
--    40 consultations, 30 ordonnances, 60 lignes d'ordonnance
--    25 factures, 50 lignes de facture, 19 paiements
--    15 gardes, 5 téléconsultations Zoom simulées
--    10 analyses, 12 demandes d'analyse, 20 notifications, 30 entrées d'audit
-- =============================================================================

USE `mediclinic`;

SET NAMES utf8mb4;

-- Hachage bcrypt (12 rounds) du mot de passe « Passw0rd!2026 ».
SET @password_hash = '$2b$12$WH7cYvGsErB31hdkQy33b.h4BF8H6.Dkcsufw8k1DeRbDH3ggAiY.';

-- -----------------------------------------------------------------------------
-- 0. Purge (script rejouable). Les contraintes FK sont désactivées le temps
--    de la purge pour ne pas dépendre de l'ordre des tables.
-- -----------------------------------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM `refresh_tokens`;
DELETE FROM `notifications`;
DELETE FROM `audit_logs`;
DELETE FROM `clinic_settings`;
DELETE FROM `lab_requests`;
DELETE FROM `lab_tests`;
DELETE FROM `meetings`;
DELETE FROM `shifts`;
DELETE FROM `payments`;
DELETE FROM `invoice_items`;
DELETE FROM `invoices`;
DELETE FROM `stock_movements`;
DELETE FROM `prescription_items`;
DELETE FROM `prescriptions`;
DELETE FROM `consultations`;
DELETE FROM `appointments`;
DELETE FROM `medications`;
UPDATE `departments` SET `head_doctor_id` = NULL;
DELETE FROM `doctors`;
DELETE FROM `departments`;
DELETE FROM `specialties`;
DELETE FROM `patients`;
DELETE FROM `user_roles`;
DELETE FROM `role_permissions`;
DELETE FROM `permissions`;
DELETE FROM `roles`;
DELETE FROM `users`;

SET FOREIGN_KEY_CHECKS = 1;

-- Séquence utilitaire (1..60) servant à générer les volumes.
DROP TEMPORARY TABLE IF EXISTS `seed_seq`;
CREATE TEMPORARY TABLE `seed_seq` (`n` INT NOT NULL PRIMARY KEY);
INSERT INTO `seed_seq` (`n`) VALUES
 (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),
 (11),(12),(13),(14),(15),(16),(17),(18),(19),(20),
 (21),(22),(23),(24),(25),(26),(27),(28),(29),(30),
 (31),(32),(33),(34),(35),(36),(37),(38),(39),(40),
 (41),(42),(43),(44),(45),(46),(47),(48),(49),(50),
 (51),(52),(53),(54),(55),(56),(57),(58),(59),(60);

-- =============================================================================
-- 1. RBAC — rôles
-- =============================================================================
INSERT INTO `roles` (`id`, `code`, `name`, `description`, `is_system`) VALUES
(1, 'SUPER_ADMIN',  'Super administrateur', 'Accès total, y compris la gestion de la matrice des rôles', TRUE),
(2, 'ADMIN',        'Administrateur',       'Gestion complète de la clinique hors matrice des rôles',    TRUE),
(3, 'DOCTOR',       'Médecin',              'Consultations, ordonnances, téléconsultations',             TRUE),
(4, 'NURSE',        'Infirmier(ère)',       'Accueil clinique, constantes, préparation des consultations', TRUE),
(5, 'PHARMACIST',   'Pharmacien(ne)',       'Catalogue, stock et dispensation des ordonnances',          TRUE),
(6, 'RECEPTIONIST', 'Réceptionniste',       'Accueil, rendez-vous, facturation au guichet',              TRUE),
(7, 'ACCOUNTANT',   'Comptable',            'Facturation, encaissements et rapports financiers',         TRUE),
(8, 'PATIENT',      'Patient',              'Espace patient : rendez-vous, dossier, ordonnances',        TRUE);

-- =============================================================================
-- 2. RBAC — permissions atomiques « ressource:action » (77)
-- =============================================================================
INSERT INTO `permissions` (`id`, `code`, `resource`, `action`, `description`) VALUES
-- Patients
(1,  'patient:create',      'patient',      'create', 'Créer un dossier patient'),
(2,  'patient:read',        'patient',      'read',   'Consulter les dossiers patients'),
(3,  'patient:update',      'patient',      'update', 'Modifier un dossier patient'),
(4,  'patient:delete',      'patient',      'delete', 'Supprimer un dossier patient'),
-- Médecins
(5,  'doctor:create',       'doctor',       'create', 'Créer un profil médecin'),
(6,  'doctor:read',         'doctor',       'read',   'Consulter les médecins'),
(7,  'doctor:update',       'doctor',       'update', 'Modifier un profil médecin'),
(8,  'doctor:delete',       'doctor',       'delete', 'Supprimer un profil médecin'),
-- Spécialités
(9,  'specialty:create',    'specialty',    'create', 'Créer une spécialité'),
(10, 'specialty:read',      'specialty',    'read',   'Consulter les spécialités'),
(11, 'specialty:update',    'specialty',    'update', 'Modifier une spécialité'),
(12, 'specialty:delete',    'specialty',    'delete', 'Supprimer une spécialité'),
-- Départements
(13, 'department:create',   'department',   'create', 'Créer un département'),
(14, 'department:read',     'department',   'read',   'Consulter les départements'),
(15, 'department:update',   'department',   'update', 'Modifier un département'),
(16, 'department:delete',   'department',   'delete', 'Supprimer un département'),
-- Rendez-vous
(17, 'appointment:create',  'appointment',  'create', 'Planifier un rendez-vous'),
(18, 'appointment:read',    'appointment',  'read',   'Consulter les rendez-vous'),
(19, 'appointment:update',  'appointment',  'update', 'Modifier ou replanifier un rendez-vous'),
(20, 'appointment:delete',  'appointment',  'delete', 'Supprimer un rendez-vous'),
-- Consultations
(21, 'consultation:create', 'consultation', 'create', 'Saisir une consultation'),
(22, 'consultation:read',   'consultation', 'read',   'Consulter les comptes-rendus'),
(23, 'consultation:update', 'consultation', 'update', 'Modifier une consultation'),
(24, 'consultation:delete', 'consultation', 'delete', 'Supprimer une consultation'),
-- Ordonnances
(25, 'prescription:create', 'prescription', 'create', 'Rédiger une ordonnance'),
(26, 'prescription:read',   'prescription', 'read',   'Consulter les ordonnances'),
(27, 'prescription:update', 'prescription', 'update', 'Modifier une ordonnance'),
(28, 'prescription:delete', 'prescription', 'delete', 'Supprimer une ordonnance'),
(29, 'prescription:manage', 'prescription', 'manage', 'Dispenser une ordonnance'),
-- Médicaments
(30, 'medication:create',   'medication',   'create', 'Ajouter un médicament au catalogue'),
(31, 'medication:read',     'medication',   'read',   'Consulter le catalogue'),
(32, 'medication:update',   'medication',   'update', 'Modifier une fiche médicament'),
(33, 'medication:delete',   'medication',   'delete', 'Retirer un médicament du catalogue'),
-- Stock
(34, 'stock:create',        'stock',        'create', 'Enregistrer une entrée de stock'),
(35, 'stock:read',          'stock',        'read',   'Consulter le stock et son historique'),
(36, 'stock:update',        'stock',        'update', 'Corriger un mouvement de stock'),
(37, 'stock:manage',        'stock',        'manage', 'Ajuster le stock et gérer les alertes'),
-- Factures
(38, 'invoice:create',      'invoice',      'create', 'Émettre une facture'),
(39, 'invoice:read',        'invoice',      'read',   'Consulter les factures'),
(40, 'invoice:update',      'invoice',      'update', 'Modifier une facture'),
(41, 'invoice:delete',      'invoice',      'delete', 'Supprimer une facture'),
(42, 'invoice:manage',      'invoice',      'manage', 'Annuler ou valider une facture'),
-- Paiements
(43, 'payment:create',      'payment',      'create', 'Encaisser un paiement'),
(44, 'payment:read',        'payment',      'read',   'Consulter les paiements'),
(45, 'payment:update',      'payment',      'update', 'Corriger un paiement'),
(46, 'payment:delete',      'payment',      'delete', 'Supprimer un paiement'),
-- Gardes
(47, 'shift:create',        'shift',        'create', 'Planifier une garde'),
(48, 'shift:read',          'shift',        'read',   'Consulter le planning des gardes'),
(49, 'shift:update',        'shift',        'update', 'Modifier une garde'),
(50, 'shift:delete',        'shift',        'delete', 'Supprimer une garde'),
-- Téléconsultations
(51, 'meeting:create',      'meeting',      'create', 'Demander une téléconsultation'),
(52, 'meeting:read',        'meeting',      'read',   'Consulter les téléconsultations'),
(53, 'meeting:update',      'meeting',      'update', 'Modifier une téléconsultation'),
(54, 'meeting:delete',      'meeting',      'delete', 'Supprimer une téléconsultation'),
(55, 'meeting:manage',      'meeting',      'manage', 'Approuver ou refuser une téléconsultation'),
-- Laboratoire
(56, 'lab:create',          'lab',          'create', 'Prescrire une analyse'),
(57, 'lab:read',            'lab',          'read',   'Consulter les demandes d’analyse'),
(58, 'lab:update',          'lab',          'update', 'Saisir un résultat d’analyse'),
(59, 'lab:delete',          'lab',          'delete', 'Annuler une demande d’analyse'),
-- Journal d’audit
(60, 'audit:read',          'audit',        'read',   'Consulter le journal d’audit'),
-- Rôles
(61, 'role:create',         'role',         'create', 'Créer un rôle'),
(62, 'role:read',           'role',         'read',   'Consulter les rôles'),
(63, 'role:update',         'role',         'update', 'Modifier un rôle'),
(64, 'role:delete',         'role',         'delete', 'Supprimer un rôle'),
(65, 'role:manage',         'role',         'manage', 'Gérer la matrice rôle / permission'),
-- Utilisateurs
(66, 'user:create',         'user',         'create', 'Créer un compte utilisateur'),
(67, 'user:read',           'user',         'read',   'Consulter les comptes utilisateurs'),
(68, 'user:update',         'user',         'update', 'Modifier un compte utilisateur'),
(69, 'user:delete',         'user',         'delete', 'Désactiver un compte utilisateur'),
(70, 'user:manage',         'user',         'manage', 'Réinitialiser un mot de passe ou un rôle'),
-- Tableau de bord
(71, 'dashboard:read',      'dashboard',    'read',   'Accéder au tableau de bord'),
-- Rapports
(72, 'report:read',         'report',       'read',   'Consulter les rapports et statistiques'),
-- Notifications
(73, 'notification:read',   'notification', 'read',   'Consulter ses notifications'),
(74, 'notification:update', 'notification', 'update', 'Marquer une notification comme lue'),
(75, 'notification:delete', 'notification', 'delete', 'Supprimer une notification'),
-- Paramètres
(76, 'settings:read',       'settings',     'read',   'Consulter les paramètres de la clinique'),
(77, 'settings:update',     'settings',     'update', 'Modifier les paramètres de la clinique');

-- =============================================================================
-- 3. RBAC — matrice rôle / permission
--    Miroir exact de packages/shared/src/permissions.ts
-- =============================================================================
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON
     (r.`code` = 'SUPER_ADMIN')
  OR (r.`code` = 'ADMIN'
      AND p.`code` NOT IN ('role:create', 'role:update', 'role:delete', 'role:manage'))
  OR (r.`code` = 'DOCTOR' AND p.`code` IN (
      'patient:read', 'patient:update',
      'doctor:read', 'specialty:read', 'department:read',
      'appointment:read', 'appointment:update',
      'consultation:create', 'consultation:read', 'consultation:update',
      'prescription:create', 'prescription:read', 'prescription:update', 'prescription:manage',
      'medication:read', 'stock:read',
      'lab:create', 'lab:read', 'lab:update',
      'meeting:create', 'meeting:read', 'meeting:update', 'meeting:manage',
      'shift:read', 'dashboard:read', 'report:read',
      'notification:read', 'notification:update'))
  OR (r.`code` = 'NURSE' AND p.`code` IN (
      'patient:create', 'patient:read', 'patient:update',
      'doctor:read', 'specialty:read', 'department:read',
      'appointment:create', 'appointment:read', 'appointment:update',
      'consultation:read', 'prescription:read',
      'medication:read', 'stock:read',
      'lab:create', 'lab:read', 'lab:update',
      'meeting:read', 'shift:read', 'dashboard:read',
      'notification:read', 'notification:update'))
  OR (r.`code` = 'PHARMACIST' AND p.`code` IN (
      'patient:read',
      'medication:create', 'medication:read', 'medication:update', 'medication:delete',
      'stock:create', 'stock:read', 'stock:update', 'stock:manage',
      'prescription:read', 'prescription:manage',
      'invoice:read', 'payment:read',
      'dashboard:read', 'report:read',
      'notification:read', 'notification:update'))
  OR (r.`code` = 'RECEPTIONIST' AND p.`code` IN (
      'patient:create', 'patient:read', 'patient:update', 'patient:delete',
      'doctor:read', 'specialty:read', 'department:read',
      'appointment:create', 'appointment:read', 'appointment:update', 'appointment:delete',
      'consultation:read',
      'invoice:create', 'invoice:read',
      'payment:create', 'payment:read',
      'meeting:create', 'meeting:read', 'meeting:update',
      'shift:read', 'dashboard:read',
      'notification:read', 'notification:update'))
  OR (r.`code` = 'ACCOUNTANT' AND p.`code` IN (
      'patient:read', 'doctor:read', 'appointment:read', 'consultation:read',
      'invoice:create', 'invoice:read', 'invoice:update', 'invoice:delete', 'invoice:manage',
      'payment:create', 'payment:read', 'payment:update', 'payment:delete',
      'report:read', 'dashboard:read',
      'notification:read', 'notification:update'))
  OR (r.`code` = 'PATIENT' AND p.`code` IN (
      'patient:read', 'patient:update',
      'appointment:create', 'appointment:read',
      'consultation:read', 'prescription:read',
      'invoice:read', 'payment:read', 'lab:read',
      'meeting:create', 'meeting:read',
      'dashboard:read',
      'notification:read', 'notification:update'));

-- =============================================================================
-- 4. UTILISATEURS (53)
-- =============================================================================
INSERT INTO `users` (`id`, `email`, `password_hash`, `first_name`, `last_name`, `phone`, `is_active`) VALUES
-- Administrateurs (1-3)
(1,  'superadmin@mediclinic.fr',   @password_hash, 'Sophie',   'Bernard',      '0340000001', TRUE),
(2,  'admin@mediclinic.fr',        @password_hash, 'Julien',   'Moreau',       '0340000002', TRUE),
(3,  'direction@mediclinic.fr',    @password_hash, 'Claire',   'Fontaine',     '0340000003', TRUE),
-- Médecins (4-11)
(4,  'amine.haddad@mediclinic.fr',    @password_hash, 'Amine',        'Haddad',   '0340000011', TRUE),
(5,  'elodie.marchand@mediclinic.fr', @password_hash, 'Élodie',       'Marchand', '0340000012', TRUE),
(6,  'karim.benali@mediclinic.fr',    @password_hash, 'Karim',        'Benali',   '0340000013', TRUE),
(7,  'nathalie.roussel@mediclinic.fr',@password_hash, 'Nathalie',     'Roussel',  '0340000014', TRUE),
(8,  'thomas.girard@mediclinic.fr',   @password_hash, 'Thomas',       'Girard',   '0340000015', TRUE),
(9,  'fatima.idrissi@mediclinic.fr',  @password_hash, 'Fatima Zahra', 'Idrissi',  '0340000016', TRUE),
(10, 'lucas.petit@mediclinic.fr',     @password_hash, 'Lucas',        'Petit',    '0340000017', TRUE),
(11, 'ines.lambert@mediclinic.fr',    @password_hash, 'Inès',         'Lambert',  '0340000018', TRUE),
-- Infirmiers (12-16)
(12, 'claire.dubois@mediclinic.fr',   @password_hash, 'Claire',  'Dubois',     '0340000021', TRUE),
(13, 'samir.benkirane@mediclinic.fr', @password_hash, 'Samir',   'Benkirane',  '0340000022', TRUE),
(14, 'julie.lefevre@mediclinic.fr',   @password_hash, 'Julie',   'Lefèvre',    '0340000023', TRUE),
(15, 'marc.nguyen@mediclinic.fr',     @password_hash, 'Marc',    'Nguyen',     '0340000024', TRUE),
(16, 'aicha.traore@mediclinic.fr',    @password_hash, 'Aïcha',   'Traoré',     '0340000025', TRUE),
-- Pharmaciens (17-18)
(17, 'paul.mercier@mediclinic.fr',    @password_hash, 'Paul',    'Mercier',    '0340000031', TRUE),
(18, 'linda.bourgeois@mediclinic.fr', @password_hash, 'Linda',   'Bourgeois',  '0340000032', TRUE),
-- Réceptionnistes (19-21)
(19, 'emma.gautier@mediclinic.fr',    @password_hash, 'Emma',    'Gautier',    '0340000041', TRUE),
(20, 'youssef.amrani@mediclinic.fr',  @password_hash, 'Youssef', 'Amrani',     '0340000042', TRUE),
(21, 'chloe.barbier@mediclinic.fr',   @password_hash, 'Chloé',   'Barbier',    '0340000043', TRUE),
-- Comptables (22-23)
(22, 'hugo.charpentier@mediclinic.fr',@password_hash, 'Hugo',    'Charpentier','0340000051', TRUE),
(23, 'nadia.belkacem@mediclinic.fr',  @password_hash, 'Nadia',   'Belkacem',   '0340000052', TRUE),
-- Patients (24-53) — un compte portail par patient
(24, 'lucie.durand@email.fr',     @password_hash, 'Lucie',   'Durand',     '0341000001', TRUE),
(25, 'pierre.lambert@email.fr',   @password_hash, 'Pierre',  'Lambert',    '0341000002', TRUE),
(26, 'sophie.renard@email.fr',    @password_hash, 'Sophie',  'Renard',     '0341000003', TRUE),
(27, 'mehdi.bouzid@email.fr',     @password_hash, 'Mehdi',   'Bouzid',     '0341000004', TRUE),
(28, 'camille.roy@email.fr',      @password_hash, 'Camille', 'Roy',        '0341000005', TRUE),
(29, 'antoine.faure@email.fr',    @password_hash, 'Antoine', 'Faure',      '0341000006', TRUE),
(30, 'lea.girard@email.fr',       @password_hash, 'Léa',     'Girard',     '0341000007', TRUE),
(31, 'omar.sassi@email.fr',       @password_hash, 'Omar',    'Sassi',      '0341000008', TRUE),
(32, 'manon.leroy@email.fr',      @password_hash, 'Manon',   'Leroy',      '0341000009', TRUE),
(33, 'david.simon@email.fr',      @password_hash, 'David',   'Simon',      '0341000010', TRUE),
(34, 'ines.moreau@email.fr',      @password_hash, 'Inès',    'Moreau',     '0341000011', TRUE),
(35, 'karim.zerrouki@email.fr',   @password_hash, 'Karim',   'Zerrouki',   '0341000012', TRUE),
(36, 'elise.blanc@email.fr',      @password_hash, 'Élise',   'Blanc',      '0341000013', TRUE),
(37, 'nicolas.guerin@email.fr',   @password_hash, 'Nicolas', 'Guérin',     '0341000014', TRUE),
(38, 'sarah.cohen@email.fr',      @password_hash, 'Sarah',   'Cohen',      '0341000015', TRUE),
(39, 'julien.masson@email.fr',    @password_hash, 'Julien',  'Masson',     '0341000016', TRUE),
(40, 'amina.diallo@email.fr',     @password_hash, 'Amina',   'Diallo',     '0341000017', TRUE),
(41, 'thomas.henry@email.fr',     @password_hash, 'Thomas',  'Henry',      '0341000018', TRUE),
(42, 'clara.roux@email.fr',       @password_hash, 'Clara',   'Roux',       '0341000019', TRUE),
(43, 'maxime.vidal@email.fr',     @password_hash, 'Maxime',  'Vidal',      '0341000020', TRUE),
(44, 'nadia.cherif@email.fr',     @password_hash, 'Nadia',   'Chérif',     '0341000021', TRUE),
(45, 'paul.deschamps@email.fr',   @password_hash, 'Paul',    'Deschamps',  '0341000022', TRUE),
(46, 'zoe.marchal@email.fr',      @password_hash, 'Zoé',     'Marchal',    '0341000023', TRUE),
(47, 'rachid.alaoui@email.fr',    @password_hash, 'Rachid',  'Alaoui',     '0341000024', TRUE),
(48, 'celine.perrin@email.fr',    @password_hash, 'Céline',  'Perrin',     '0341000025', TRUE),
(49, 'hugo.noel@email.fr',        @password_hash, 'Hugo',    'Noël',       '0341000026', TRUE),
(50, 'farida.bensalem@email.fr',  @password_hash, 'Farida',  'Bensalem',   '0341000027', TRUE),
(51, 'arthur.lucas@email.fr',     @password_hash, 'Arthur',  'Lucas',      '0341000028', TRUE),
(52, 'marie.fontaine@email.fr',   @password_hash, 'Marie',   'Fontaine',   '0341000029', TRUE),
(53, 'yasmine.hamdi@email.fr',    @password_hash, 'Yasmine', 'Hamdi',      '0341000030', TRUE);

-- Affectation des rôles (un rôle par utilisateur, sauf le super admin qui en
-- porte deux : la relation users ↔ roles est bien de type N-N).
INSERT INTO `user_roles` (`user_id`, `role_id`)
SELECT u.`id`,
       CASE
         WHEN u.`id` = 1                     THEN 1
         WHEN u.`id` IN (2, 3)               THEN 2
         WHEN u.`id` BETWEEN 4  AND 11       THEN 3
         WHEN u.`id` BETWEEN 12 AND 16       THEN 4
         WHEN u.`id` IN (17, 18)             THEN 5
         WHEN u.`id` BETWEEN 19 AND 21       THEN 6
         WHEN u.`id` IN (22, 23)             THEN 7
         ELSE 8
       END
FROM `users` u;

INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES (1, 2);

-- =============================================================================
-- 5. SPÉCIALITÉS ET DÉPARTEMENTS
-- =============================================================================
INSERT INTO `specialties` (`id`, `name`, `description`) VALUES
(1,  'Cardiologie',                'Diagnostic et suivi des maladies cardiovasculaires'),
(2,  'Dermatologie',               'Affections de la peau, des cheveux et des ongles'),
(3,  'Pédiatrie',                  'Suivi médical des nouveau-nés, enfants et adolescents'),
(4,  'Gynécologie-Obstétrique',    'Santé de la femme, grossesse et suivi prénatal'),
(5,  'Médecine générale',          'Premier recours, prévention et suivi global'),
(6,  'Neurologie',                 'Troubles du système nerveux central et périphérique'),
(7,  'Chirurgie orthopédique',     'Appareil locomoteur, traumatologie et rééducation'),
(8,  'Ophtalmologie',              'Vision, globe oculaire et annexes'),
(9,  'Radiologie',                 'Imagerie médicale et explorations fonctionnelles'),
(10, 'Médecine du travail',        'Prévention des risques professionnels');

INSERT INTO `departments` (`id`, `name`, `description`, `head_doctor_id`) VALUES
(1, 'Cardiologie',                'Unité de cardiologie et explorations fonctionnelles', NULL),
(2, 'Pédiatrie',                  'Service de pédiatrie générale et néonatalogie',      NULL),
(3, 'Médecine générale',          'Consultations externes et médecine de famille',       NULL),
(4, 'Chirurgie orthopédique',     'Bloc opératoire et consultations traumatologiques',   NULL),
(5, 'Dermatologie',               'Consultations dermatologiques et petite chirurgie',   NULL),
(6, 'Gynécologie-Obstétrique',    'Maternité et suivi gynécologique',                    NULL),
(7, 'Neurologie',                 'Explorations neurologiques et suivi',                 NULL),
(8, 'Urgences',                   'Accueil des urgences 24h/24',                         NULL);

-- =============================================================================
-- 6. MÉDECINS
-- =============================================================================
INSERT INTO `doctors` (`id`, `user_id`, `specialty_id`, `department_id`, `license_number`, `consultation_fee`, `bio`, `is_accepting_patients`) VALUES
(1, 4,  1, 1, 'MED-CARD-0001', 70.00, 'Cardiologue interventionnel, 15 ans d’expérience hospitalière.', TRUE),
(2, 5,  2, 5, 'MED-DERM-0002', 55.00, 'Dermatologue, spécialisée en dermatologie pédiatrique.',        TRUE),
(3, 6,  3, 2, 'MED-PEDI-0003', 45.00, 'Pédiatre, ancien chef de clinique en néonatalogie.',            TRUE),
(4, 7,  4, 6, 'MED-GYNE-0004', 60.00, 'Gynécologue-obstétricienne, suivi de grossesse à risque.',      TRUE),
(5, 8,  5, 3, 'MED-GENE-0005', 35.00, 'Médecin généraliste, référent prévention et vaccination.',      TRUE),
(6, 9,  6, 7, 'MED-NEUR-0006', 75.00, 'Neurologue, explorations du sommeil et migraines.',             TRUE),
(7, 10, 7, 4, 'MED-ORTH-0007', 65.00, 'Chirurgien orthopédiste, traumatologie du sport.',              TRUE),
(8, 11, 8, 3, 'MED-OPHT-0008', 50.00, 'Ophtalmologue, chirurgie de la cataracte.',                     FALSE);

-- Chefs de département (FK différée de departments vers doctors).
UPDATE `departments` SET `head_doctor_id` = 1 WHERE `id` = 1;
UPDATE `departments` SET `head_doctor_id` = 3 WHERE `id` = 2;
UPDATE `departments` SET `head_doctor_id` = 5 WHERE `id` = 3;
UPDATE `departments` SET `head_doctor_id` = 7 WHERE `id` = 4;
UPDATE `departments` SET `head_doctor_id` = 2 WHERE `id` = 5;
UPDATE `departments` SET `head_doctor_id` = 4 WHERE `id` = 6;
UPDATE `departments` SET `head_doctor_id` = 6 WHERE `id` = 7;

-- =============================================================================
-- 7. PATIENTS (30) — dérivés des comptes utilisateurs 24 à 53
-- =============================================================================
INSERT INTO `patients` (
  `id`, `user_id`, `first_name`, `last_name`, `birth_date`, `gender`,
  `address`, `city`, `postal_code`, `phone`, `email`, `blood_group`,
  `allergies`, `medical_history`,
  `emergency_contact_name`, `emergency_contact_phone`, `insurance_number`
)
SELECT
  u.`id` - 23,
  u.`id`,
  u.`first_name`,
  u.`last_name`,
  DATE_SUB(CURDATE(), INTERVAL (9000 + ((u.`id` * 137) % 14000)) DAY),
  ELT(u.`id` - 23,
      'FEMALE','MALE','FEMALE','MALE','FEMALE','MALE','FEMALE','MALE','FEMALE','MALE',
      'FEMALE','MALE','FEMALE','MALE','FEMALE','MALE','FEMALE','MALE','FEMALE','MALE',
      'FEMALE','MALE','FEMALE','MALE','FEMALE','MALE','FEMALE','MALE','FEMALE','FEMALE'),
  CONCAT(10 + (u.`id` % 80), ' rue des Lilas'),
  ELT((u.`id` % 6) + 1, 'Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice', 'Nantes'),
  LPAD(75000 + ((u.`id` % 20) * 100), 5, '0'),
  u.`phone`,
  u.`email`,
  ELT((u.`id` % 8) + 1, 'A+', 'O+', 'B+', 'AB+', 'A-', 'O-', 'B-', 'AB-'),
  CASE
    WHEN u.`id` % 3 = 0 THEN 'Pénicilline'
    WHEN u.`id` % 5 = 0 THEN 'Arachides'
    WHEN u.`id` % 7 = 0 THEN 'Aspirine'
    ELSE NULL
  END,
  CONCAT('Antécédents renseignés lors de l’admission : ',
         ELT((u.`id` % 5) + 1,
             'aucun antécédent notable',
             'hypertension artérielle traitée',
             'asthme léger',
             'appendicectomie en 2015',
             'diabète de type 2 équilibré')),
  CONCAT('Contact ', u.`last_name`),
  CONCAT('0342', LPAD(((u.`id` * 76543) % 1000000), 6, '0')),
  CONCAT('ASS-', LPAD(u.`id` - 23, 6, '0'))
FROM `users` u
WHERE u.`id` BETWEEN 24 AND 53;

-- =============================================================================
-- 8. MÉDICAMENTS (20) ET MOUVEMENTS DE STOCK
--    Le stock est initialisé à 0 puis alimenté par des mouvements : la colonne
--    medications.stock_quantity est exclusivement pilotée par les triggers.
-- =============================================================================
INSERT INTO `medications` (`id`, `name`, `category`, `unit`, `price`, `stock_quantity`, `alert_threshold`, `expiry_date`, `supplier`) VALUES
(1,  'Paracétamol 500 mg',            'Antalgique',         'comprimé',  0.05, 0, 100, DATE_ADD(CURDATE(), INTERVAL 420 DAY), 'Pharma Distribution'),
(2,  'Amoxicilline 1 g',              'Antibiotique',       'comprimé',  0.35, 0,  80, DATE_ADD(CURDATE(), INTERVAL 310 DAY), 'MediSupply'),
(3,  'Ibuprofène 400 mg',             'Anti-inflammatoire', 'comprimé',  0.08, 0, 100, DATE_ADD(CURDATE(), INTERVAL 260 DAY), 'Pharma Distribution'),
(4,  'Oméprazole 20 mg',              'Gastro-entérologie', 'gélule',    0.22, 0,  60, DATE_ADD(CURDATE(), INTERVAL  18 DAY), 'MediSupply'),
(5,  'Salbutamol 100 µg',             'Pneumologie',        'flacon',    6.50, 0,  30, DATE_ADD(CURDATE(), INTERVAL 500 DAY), 'AeroMed'),
(6,  'Metformine 850 mg',             'Diabétologie',       'comprimé',  0.11, 0, 120, DATE_ADD(CURDATE(), INTERVAL 380 DAY), 'Pharma Distribution'),
(7,  'Amlodipine 5 mg',               'Cardiologie',        'comprimé',  0.14, 0,  90, DATE_ADD(CURDATE(), INTERVAL 340 DAY), 'CardioPharm'),
(8,  'Atorvastatine 20 mg',           'Cardiologie',        'comprimé',  0.19, 0,  90, DATE_ADD(CURDATE(), INTERVAL 290 DAY), 'CardioPharm'),
(9,  'Cétirizine 10 mg',              'Antihistaminique',   'comprimé',  0.09, 0,  70, DATE_ADD(CURDATE(), INTERVAL 460 DAY), 'MediSupply'),
(10, 'Prednisolone 20 mg',            'Corticostéroïde',    'comprimé',  0.24, 0,  50, DATE_ADD(CURDATE(), INTERVAL 210 DAY), 'Pharma Distribution'),
(11, 'Azithromycine 250 mg',          'Antibiotique',       'comprimé',  0.85, 0,  40, DATE_ADD(CURDATE(), INTERVAL 240 DAY), 'MediSupply'),
(12, 'Tramadol 50 mg',                'Antalgique',         'gélule',    0.31, 0,  60, DATE_ADD(CURDATE(), INTERVAL 330 DAY), 'Pharma Distribution'),
(13, 'Insuline Glargine 100 UI/ml',   'Diabétologie',       'stylo',    32.00, 0,  20, DATE_ADD(CURDATE(), INTERVAL 150 DAY), 'EndoCare'),
(14, 'Fer + Acide folique',           'Vitamines',          'comprimé',  0.07, 0, 100, DATE_ADD(CURDATE(), INTERVAL 540 DAY), 'MediSupply'),
(15, 'Sérum physiologique 500 ml',    'Solution',           'flacon',    1.20, 0,  80, DATE_SUB(CURDATE(), INTERVAL  12 DAY), 'AeroMed'),
(16, 'Povidone iodée 10 %',           'Antiseptique',       'flacon',    2.40, 0,  40, DATE_ADD(CURDATE(), INTERVAL 600 DAY), 'AeroMed'),
(17, 'Diazépam 10 mg',                'Psychiatrie',        'comprimé',  0.16, 0,  30, DATE_ADD(CURDATE(), INTERVAL 270 DAY), 'Pharma Distribution'),
(18, 'Losartan 50 mg',                'Cardiologie',        'comprimé',  0.17, 0,  90, DATE_ADD(CURDATE(), INTERVAL 355 DAY), 'CardioPharm'),
(19, 'Sertraline 50 mg',              'Psychiatrie',        'comprimé',  0.28, 0,  50, DATE_ADD(CURDATE(), INTERVAL 300 DAY), 'Pharma Distribution'),
(20, 'Artéméther-Luméfantrine',       'Antipaludique',      'boîte',     4.90, 0,  25, DATE_ADD(CURDATE(), INTERVAL  25 DAY), 'MediSupply');

-- Entrées de stock initiales : 500 unités par référence.
-- (table temporaire pour éviter l'erreur 1442 : le trigger met à jour
--  medications, le statement ne doit donc pas la lire directement)
DROP TEMPORARY TABLE IF EXISTS `seed_meds`;
CREATE TEMPORARY TABLE `seed_meds` (`id` INT NOT NULL PRIMARY KEY);
INSERT INTO `seed_meds` (`id`) SELECT `id` FROM `medications`;

INSERT INTO `stock_movements` (`medication_id`, `type`, `quantity`, `reason`, `user_id`, `created_at`)
SELECT m.`id`, 'IN', 500, 'Réception de la commande trimestrielle', 17,
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 90 DAY), '09:00:00')
FROM `seed_meds` m;

-- Sorties cumulées : amènent chaque référence à son stock cible.
-- Cinq références finissent sous leur seuil d'alerte (dont une périmée).
INSERT INTO `stock_movements` (`medication_id`, `type`, `quantity`, `reason`, `user_id`, `created_at`)
SELECT m.`id`, 'OUT',
       500 - ELT(m.`id`,
                 320, 180,  60,   8,  45, 240,  95, 410, 150,  35,
                 480, 260,  88, 140,  25, 300, 190, 470,  55,  22),
       'Dispensations cumulées et retrait des lots périmés', 18,
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 20 DAY), '15:30:00')
FROM `seed_meds` m;

-- =============================================================================
-- 9. RENDEZ-VOUS — 40 rendez-vous passés terminés, répartis sur ~3 mois
--    (identifiants 101 à 140, générés de façon déterministe)
-- =============================================================================
INSERT INTO `appointments` (
  `id`, `patient_id`, `doctor_id`, `department_id`, `scheduled_at`, `duration`,
  `status`, `type`, `reason`, `notes`, `created_by`, `created_at`
)
SELECT
  100 + s.`n`,
  ((s.`n` * 7) % 30) + 1,
  ((s.`n` - 1) % 8) + 1,
  ELT(((s.`n` - 1) % 8) + 1, 1, 5, 2, 6, 3, 7, 4, 3),
  TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL (4 + s.`n` * 2) DAY),
            SEC_TO_TIME((8 + (s.`n` % 9)) * 3600)),
  30,
  'COMPLETED',
  CASE WHEN s.`n` IN (5, 18) THEN 'TELEMEDICINE' ELSE 'IN_PERSON' END,
  ELT(((s.`n` - 1) % 6) + 1,
      'Contrôle de suivi', 'Douleurs persistantes', 'Bilan annuel',
      'Renouvellement d’ordonnance', 'Consultation de suivi', 'Avis spécialisé'),
  CASE WHEN s.`n` % 4 = 0 THEN 'Patient revu en consultation externe.' ELSE NULL END,
  19,
  TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL (5 + s.`n` * 2) DAY), '07:30:00')
FROM `seed_seq` s
WHERE s.`n` <= 40;

-- Rendez-vous passés non honorés (identifiants 201 à 204).
INSERT INTO `appointments` (`id`, `patient_id`, `doctor_id`, `department_id`, `scheduled_at`, `duration`, `status`, `type`, `reason`, `cancelled_reason`, `created_by`, `created_at`) VALUES
(201,  5, 4, 6, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 12 DAY), '09:30:00'), 30, 'CANCELLED', 'IN_PERSON',   'Consultation gynécologique',    'Patiente indisponible',                 20, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 20 DAY), '10:00:00')),
(202, 14, 7, 4, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 25 DAY), '11:00:00'), 30, 'CANCELLED', 'IN_PERSON',   'Douleur au genou',              'Reporté à la demande du médecin',       19, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 32 DAY), '14:20:00')),
(203,  9, 1, 1, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 40 DAY), '15:00:00'), 45, 'CANCELLED', 'IN_PERSON',   'Bilan cardiologique complet',   'Annulé par le patient',                 19, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 48 DAY), '09:10:00')),
(204, 20, 5, 3, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 18 DAY), '08:30:00'), 20, 'NO_SHOW',   'IN_PERSON',   'Contrôle de tension artérielle', NULL,                                   19, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 26 DAY), '16:45:00'));

-- Rendez-vous du jour et à venir (identifiants 141 à 146).
INSERT INTO `appointments` (`id`, `patient_id`, `doctor_id`, `department_id`, `scheduled_at`, `duration`, `status`, `type`, `reason`, `created_by`, `created_at`) VALUES
(141,  3, 5, 3, TIMESTAMP(CURDATE(), '09:00:00'),                              30, 'CHECKED_IN',  'IN_PERSON',    'Renouvellement d’ordonnance',        20, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  6 DAY), '09:00:00')),
(142, 11, 1, 1, TIMESTAMP(CURDATE(), '10:30:00'),                              30, 'IN_PROGRESS', 'TELEMEDICINE', 'Téléconsultation de suivi cardiologique', 19, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 4 DAY), '11:30:00')),
(143, 22, 3, 2, TIMESTAMP(CURDATE(), '14:00:00'),                              20, 'CONFIRMED',   'IN_PERSON',    'Fièvre et toux depuis 3 jours',      21, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  2 DAY), '15:10:00')),
(144,  7, 2, 5, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 4 DAY), '11:00:00'),    30, 'CONFIRMED',   'TELEMEDICINE', 'Suivi dermatologique',               19, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  1 DAY), '10:05:00')),
(145, 18, 6, 7, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 6 DAY), '08:30:00'),    45, 'CONFIRMED',   'IN_PERSON',    'Céphalées chroniques',               20, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  3 DAY), '17:40:00')),
(146, 26, 8, 3, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 9 DAY), '16:30:00'),    30, 'PENDING',     'TELEMEDICINE', 'Baisse de l’acuité visuelle',        21, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL  1 DAY), '08:25:00'));

-- =============================================================================
-- 10. CONSULTATIONS (40) — une par rendez-vous terminé
-- =============================================================================
INSERT INTO `consultations` (`id`, `appointment_id`, `doctor_id`, `diagnosis`, `notes`, `follow_up_at`, `created_at`)
SELECT
  a.`id` - 100,
  a.`id`,
  a.`doctor_id`,
  ELT((a.`id` % 10) + 1,
      'Hypertension artérielle essentielle stade 1',
      'Dermatite atopique de l’adulte',
      'Angine aiguë d’origine virale',
      'Lombalgie commune sans signe de gravité',
      'Diabète de type 2 déséquilibré',
      'Migraine sans aura, épisodes mensuels',
      'Entorse bénigne de la cheville droite',
      'Conjonctivite allergique saisonnière',
      'Reflux gastro-œsophagien simple',
      'Asthme intermittent contrôlé'),
  CONCAT('Examen clinique complet. Constantes stables. ',
         ELT((a.`id` % 3) + 1,
             'Traitement ajusté et surveillance rapprochée.',
             'Bilan biologique complémentaire demandé.',
             'Éducation thérapeutique et conseils hygiéno-diététiques.')),
  CASE WHEN a.`id` % 3 = 0 THEN DATE_ADD(DATE(a.`scheduled_at`), INTERVAL 30 DAY) ELSE NULL END,
  DATE_ADD(a.`scheduled_at`, INTERVAL 25 MINUTE)
FROM `appointments` a
WHERE a.`id` BETWEEN 101 AND 140;

-- =============================================================================
-- 11. ORDONNANCES (30) ET LIGNES D'ORDONNANCE (60)
-- =============================================================================
INSERT INTO `prescriptions` (`id`, `consultation_id`, `doctor_id`, `issued_at`, `status`)
SELECT
  c.`id`,
  c.`id`,
  c.`doctor_id`,
  DATE_ADD(c.`created_at`, INTERVAL 5 MINUTE),
  CASE
    WHEN c.`id` % 10 = 0 THEN 'CANCELLED'
    WHEN c.`id` % 5  = 0 THEN 'DISPENSED'
    ELSE 'ISSUED'
  END
FROM `consultations` c
WHERE c.`id` <= 30;

-- Deux lignes par ordonnance, médicaments répartis sur tout le catalogue.
INSERT INTO `prescription_items` (`prescription_id`, `medication_id`, `dosage`, `frequency`, `duration`, `instructions`, `quantity`)
SELECT
  p.`id`,
  ((p.`id` * 3 + k.`n` - 2) % 20) + 1,
  ELT(k.`n`, '1 comprimé', '2 comprimés'),
  ELT(((p.`id` + k.`n`) % 3) + 1, '1 fois par jour', '2 fois par jour', '3 fois par jour'),
  ELT(((p.`id` + k.`n`) % 4) + 1, '5 jours', '7 jours', '14 jours', '1 mois'),
  ELT(((p.`id` + k.`n`) % 3) + 1,
      'À prendre pendant les repas',
      'À prendre le matin à jeun',
      'À prendre au coucher'),
  1 + ((p.`id` + k.`n`) % 2)
FROM `prescriptions` p
JOIN `seed_seq` k ON k.`n` <= 2;

-- =============================================================================
-- 12. FACTURATION — 25 factures, lignes, totaux et paiements
-- =============================================================================
INSERT INTO `invoices` (`id`, `number`, `patient_id`, `consultation_id`, `subtotal`, `vat_rate`, `vat_amount`, `total_amount`, `paid_amount`, `status`, `issued_at`, `due_date`, `created_by`)
SELECT
  c.`id`,
  CONCAT('FAC-', DATE_FORMAT(c.`created_at`, '%Y'), '-', LPAD(c.`id`, 5, '0')),
  a.`patient_id`,
  c.`id`,
  0.00, 20.00, 0.00, 0.00, 0.00,
  'ISSUED',
  c.`created_at`,
  DATE_ADD(DATE(c.`created_at`), INTERVAL 30 DAY),
  22
FROM `consultations` c
JOIN `appointments` a ON a.`id` = c.`appointment_id`
WHERE c.`id` <= 25;

-- Lignes de facture : honoraires de consultation + actes complémentaires.
DROP TEMPORARY TABLE IF EXISTS `seed_invoice_lines`;
CREATE TEMPORARY TABLE `seed_invoice_lines` AS
SELECT i.`id` AS `invoice_id`,
       d.`consultation_fee` AS `consultation_fee`,
       s.`name` AS `specialty_name`,
       du.`last_name` AS `doctor_last_name`
FROM `invoices` i
JOIN `consultations` c ON c.`id` = i.`consultation_id`
JOIN `doctors` d       ON d.`id` = c.`doctor_id`
JOIN `users` du        ON du.`id` = d.`user_id`
JOIN `specialties` s   ON s.`id` = d.`specialty_id`;

INSERT INTO `invoice_items` (`invoice_id`, `label`, `quantity`, `unit_price`)
SELECT
  sil.`invoice_id`,
  ELT(k.`n`,
      CONCAT('Consultation ', sil.`specialty_name`, ' — Dr ', sil.`doctor_last_name`),
      'Actes complémentaires et examens'),
  1,
  ELT(k.`n`, sil.`consultation_fee`, 25.00 + ((sil.`invoice_id` % 4) * 5.00))
FROM `seed_invoice_lines` sil
JOIN `seed_seq` k ON k.`n` <= 2;

-- Consolidation des totaux (les triggers recalculent également ces colonnes ;
-- cette mise à jour explicite garantit un état identique en toute circonstance).
UPDATE `invoices` i
JOIN (
  SELECT `invoice_id`, ROUND(SUM(`line_total`), 2) AS `subtotal_ht`
  FROM `invoice_items`
  GROUP BY `invoice_id`
) t ON t.`invoice_id` = i.`id`
SET i.`subtotal`     = t.`subtotal_ht`,
    i.`vat_amount`   = ROUND(t.`subtotal_ht` * i.`vat_rate` / 100, 2),
    i.`total_amount` = ROUND(t.`subtotal_ht` * (1 + i.`vat_rate` / 100), 2);

-- Paiements : 19 factures encaissées (15 soldées, 4 partielles).
-- Les triggers mettent à jour paid_amount et status automatiquement.
DROP TEMPORARY TABLE IF EXISTS `seed_pay_invoices`;
CREATE TEMPORARY TABLE `seed_pay_invoices` AS
SELECT `id`, `total_amount`, `issued_at`
FROM `invoices`
WHERE `id` % 4 <> 0;

INSERT INTO `payments` (`invoice_id`, `amount`, `method`, `paid_at`, `reference`, `recorded_by`)
SELECT
  i.`id`,
  CASE WHEN i.`id` % 5 = 0 THEN ROUND(i.`total_amount` / 2, 2) ELSE i.`total_amount` END,
  ELT((i.`id` % 5) + 1, 'CASH', 'CARD', 'TRANSFER', 'INSURANCE', 'CHEQUE'),
  DATE_ADD(i.`issued_at`, INTERVAL 2 DAY),
  CONCAT('REF-', LPAD(i.`id`, 6, '0')),
  22
FROM `seed_pay_invoices` i;

-- Une facture annulée pour couvrir le cas métier.
UPDATE `invoices` SET `status` = 'CANCELLED' WHERE `id` = 24;

-- =============================================================================
-- 13. GARDES (15)
-- =============================================================================
INSERT INTO `shifts` (`id`, `doctor_id`, `department_id`, `start_at`, `end_at`, `type`, `status`, `notes`, `created_by`) VALUES
(1,  1, 1, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '08:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '18:00:00'), 'DAY',     'COMPLETED', 'Garde de jour en cardiologie',            2),
(2,  5, 3, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '18:00:00'), TIMESTAMP(CURDATE(), '02:00:00'),                           'NIGHT',   'COMPLETED', 'Garde de nuit — accueil des urgences',    2),
(3,  3, 2, TIMESTAMP(CURDATE(), '08:00:00'),                           TIMESTAMP(CURDATE(), '16:00:00'),                           'DAY',     'CONFIRMED', 'Consultations pédiatriques du jour',      2),
(4,  8, 3, TIMESTAMP(DATE_SUB(NOW(), INTERVAL 2 HOUR)),                TIMESTAMP(DATE_ADD(NOW(), INTERVAL 6 HOUR)),                'DAY',     'CONFIRMED', 'Garde en cours — consultations externes', 2),
(5,  6, 7, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '08:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '18:00:00'), 'DAY',     'CONFIRMED', 'Consultations de neurologie',             2),
(6,  7, 4, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '18:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 2 DAY), '02:00:00'), 'NIGHT',   'CONFIRMED', 'Astreinte bloc orthopédique',             1),
(7,  4, 6, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 2 DAY), '08:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 2 DAY), '18:00:00'), 'DAY',     'SCHEDULED', 'Consultations gynécologiques',            2),
(8,  2, 5, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '08:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '14:00:00'), 'DAY',     'SCHEDULED', 'Dermatologie — demi-journée',             2),
(9,  1, 1, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '18:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 4 DAY), '02:00:00'), 'NIGHT',   'SCHEDULED', 'Garde de nuit en cardiologie',            1),
(10, 5, 3, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 4 DAY), '08:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 4 DAY), '18:00:00'), 'DAY',     'SCHEDULED', 'Médecine générale',                       2),
(11, 6, 7, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 5 DAY), '08:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 5 DAY), '18:00:00'), 'DAY',     'SCHEDULED', 'Explorations neurologiques',              2),
(12, 3, 2, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 6 DAY), '18:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '02:00:00'), 'NIGHT',   'SCHEDULED', 'Garde de nuit en pédiatrie',              2),
(13, 7, 4, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '08:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '18:00:00'), 'DAY',     'SCHEDULED', 'Bloc orthopédique',                       1),
(14, 4, 6, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 8 DAY), '08:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 8 DAY), '18:00:00'), 'ON_CALL', 'SCHEDULED', 'Astreinte maternité',                     2),
(15, 2, 5, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 9 DAY), '09:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 9 DAY), '17:00:00'), 'DAY',     'SCHEDULED', 'Consultations dermatologiques',           2);

-- =============================================================================
-- 14. TÉLÉCONSULTATIONS ZOOM SIMULÉES (5)
--    Les identifiants Zoom sont fictifs : l'application fonctionne sans
--    credentials Zoom réels (mode dégradé documenté dans docs/ARCHITECTURE.md).
-- =============================================================================
INSERT INTO `meetings` (
  `id`, `appointment_id`, `patient_id`, `doctor_id`, `reason`, `preferred_at`, `duration`,
  `zoom_meeting_id`, `join_url`, `start_url`, `password`, `start_time`,
  `status`, `rejection_reason`, `requested_by`, `approved_by`
) VALUES
(1, 105,  6, 5, 'Suivi de traitement antihypertenseur',      TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 66 DAY), '09:00:00'), 30,
 '84500000101', 'https://zoom.us/j/84500000101', 'https://zoom.us/s/84500000101', 'mC1aB2', TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 66 DAY), '09:00:00'),
 'COMPLETED', NULL, 29, 1),
(2, 118,  7, 2, 'Poussée de dermatite — avis rapide',        TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 40 DAY), '10:00:00'), 30,
 '84500000102', 'https://zoom.us/j/84500000102', 'https://zoom.us/s/84500000102', 'dR4eF7', TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 40 DAY), '10:00:00'),
 'COMPLETED', NULL, 30, 1),
(3, 142, 11, 1, 'Téléconsultation de suivi cardiologique',   TIMESTAMP(CURDATE(), '10:30:00'), 30,
 '84500000103', 'https://zoom.us/j/84500000103', 'https://zoom.us/s/84500000103', 'cS9tU3', TIMESTAMP(CURDATE(), '10:30:00'),
 'APPROVED', NULL, 34, 1),
(4, 144,  7, 2, 'Suivi dermatologique à distance',           TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 4 DAY), '11:00:00'), 30,
 '84500000104', 'https://zoom.us/j/84500000104', 'https://zoom.us/s/84500000104', 'pL7mN5', TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 4 DAY), '11:00:00'),
 'APPROVED', NULL, 30, 1),
(5, 146, 26, 8, 'Baisse de l’acuité visuelle — premier avis', TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 9 DAY), '16:30:00'), 30,
 NULL, NULL, NULL, NULL, NULL,
 'PENDING', NULL, 49, NULL);

-- =============================================================================
-- 15. LABORATOIRE — analyses et demandes
-- =============================================================================
INSERT INTO `lab_tests` (`id`, `name`, `category`, `price`, `turnaround_hours`) VALUES
(1,  'Numération formule sanguine',      'Hématologie',   18.00, 24),
(2,  'Glycémie à jeun',                  'Biochimie',      9.00, 12),
(3,  'Bilan lipidique complet',          'Biochimie',     24.00, 24),
(4,  'Créatinine et DFG',                'Biochimie',     14.00, 24),
(5,  'TSH ultrasensible',                'Endocrinologie',26.00, 48),
(6,  'Ionogramme sanguin',               'Biochimie',     16.00, 12),
(7,  'CRP et VS',                        'Immunologie',   12.00, 12),
(8,  'Électrocardiogramme de repos',     'Cardiologie',   35.00,  1),
(9,  'Échographie abdominale',           'Imagerie',      70.00, 48),
(10, 'Radiographie thoracique',          'Imagerie',      45.00,  4);

INSERT INTO `lab_requests` (`patient_id`, `doctor_id`, `lab_test_id`, `status`, `notes`, `result_text`, `requested_at`, `completed_at`)
SELECT
  a.`patient_id`,
  c.`doctor_id`,
  ((c.`id` - 1) % 10) + 1,
  CASE
    WHEN c.`id` % 3 = 0 THEN 'COMPLETED'
    WHEN c.`id` % 3 = 1 THEN 'IN_PROGRESS'
    ELSE 'PENDING'
  END,
  'Bilan demandé à l’issue de la consultation',
  CASE WHEN c.`id` % 3 = 0 THEN 'Résultats dans les valeurs de référence. Aucune anomalie détectée.' ELSE NULL END,
  c.`created_at`,
  CASE WHEN c.`id` % 3 = 0 THEN DATE_ADD(c.`created_at`, INTERVAL 2 DAY) ELSE NULL END
FROM `consultations` c
JOIN `appointments` a ON a.`id` = c.`appointment_id`
WHERE c.`id` <= 12;

-- =============================================================================
-- 16. NOTIFICATIONS (20)
-- =============================================================================
INSERT INTO `notifications` (`user_id`, `title`, `message`, `type`, `is_read`, `link`, `created_at`)
SELECT
  ELT(((s.`n` - 1) % 6) + 1, 1, 2, 4, 5, 17, 19),
  ELT(((s.`n` - 1) % 6) + 1,
      'Nouvelle demande de téléconsultation',
      'Rendez-vous confirmé',
      'Alerte de stock faible',
      'Facture impayée à relancer',
      'Ordonnance à dispenser',
      'Nouveau patient enregistré'),
  ELT(((s.`n` - 1) % 6) + 1,
      'Une demande de téléconsultation attend votre validation.',
      'Un rendez-vous a été confirmé pour demain matin.',
      'Une référence du catalogue est passée sous son seuil d’alerte.',
      'Une facture a dépassé sa date d’échéance.',
      'Une ordonnance est en attente de dispensation au comptoir.',
      'Un nouveau dossier patient a été créé au secrétariat.'),
  ELT(((s.`n` - 1) % 4) + 1, 'INFO', 'SUCCESS', 'WARNING', 'ERROR'),
  ((s.`n` % 3) = 0),
  ELT(((s.`n` - 1) % 6) + 1,
      '/admin/meetings', '/admin/appointments', '/admin/medications',
      '/admin/invoices', '/admin/prescriptions', '/admin/patients'),
  TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL (s.`n` % 10) DAY),
            SEC_TO_TIME(((9 + s.`n`) % 18) * 3600))
FROM `seed_seq` s
WHERE s.`n` <= 20;

-- =============================================================================
-- 17. JOURNAL D'AUDIT (30 entrées)
-- =============================================================================
INSERT INTO `audit_logs` (`user_id`, `action`, `resource`, `resource_id`, `old_value`, `new_value`, `ip_address`, `user_agent`, `created_at`)
SELECT
  ELT(((s.`n` - 1) % 6) + 1, 1, 2, 4, 5, 17, 19),
  ELT(((s.`n` - 1) % 6) + 1, 'LOGIN_SUCCESS', 'CREATE', 'UPDATE', 'APPROVE', 'PDF_ACCESS', 'STOCK_ADJUST'),
  ELT(((s.`n` - 1) % 6) + 1, 'auth', 'patient', 'appointment', 'meeting', 'invoice', 'medication'),
  CAST(1 + (s.`n` % 25) AS CHAR),
  NULL,
  CASE
    WHEN ((s.`n` - 1) % 6) IN (1, 2) THEN JSON_OBJECT('source', 'seed', 'sequence', s.`n`)
    ELSE NULL
  END,
  ELT(((s.`n` - 1) % 3) + 1, '192.168.1.24', '10.0.0.15', '127.0.0.1'),
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediClinic — jeu de démonstration',
  TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL (s.`n` % 30) DAY),
            SEC_TO_TIME(((8 + s.`n`) % 18) * 3600))
FROM `seed_seq` s
WHERE s.`n` <= 30;

-- =============================================================================
-- 18. PARAMÈTRES DE LA CLINIQUE (ligne unique)
-- =============================================================================
INSERT INTO `clinic_settings` (`id`, `name`, `address`, `phone`, `email`, `currency`, `vat_rate`, `logo_url`) VALUES
(1, 'Clinique MediClinic',
    '12 avenue de la Santé, 75015 Paris, France',
    '+33 1 45 67 89 00',
    'contact@mediclinic.fr',
    'EUR', 20.00, NULL);

-- =============================================================================
-- 19. NETTOYAGE
-- =============================================================================
DROP TEMPORARY TABLE IF EXISTS `seed_seq`;

-- =============================================================================
-- 20. VÉRIFICATION — exécuter ces requêtes pour contrôler le jeu de données
-- =============================================================================
SELECT 'roles'                AS `table`, COUNT(*) AS `lignes` FROM `roles`
UNION ALL SELECT 'permissions',          COUNT(*) FROM `permissions`
UNION ALL SELECT 'role_permissions',     COUNT(*) FROM `role_permissions`
UNION ALL SELECT 'users',                COUNT(*) FROM `users`
UNION ALL SELECT 'user_roles',           COUNT(*) FROM `user_roles`
UNION ALL SELECT 'specialties',          COUNT(*) FROM `specialties`
UNION ALL SELECT 'departments',          COUNT(*) FROM `departments`
UNION ALL SELECT 'doctors',              COUNT(*) FROM `doctors`
UNION ALL SELECT 'patients',             COUNT(*) FROM `patients`
UNION ALL SELECT 'medications',          COUNT(*) FROM `medications`
UNION ALL SELECT 'stock_movements',      COUNT(*) FROM `stock_movements`
UNION ALL SELECT 'appointments',         COUNT(*) FROM `appointments`
UNION ALL SELECT 'consultations',        COUNT(*) FROM `consultations`
UNION ALL SELECT 'prescriptions',        COUNT(*) FROM `prescriptions`
UNION ALL SELECT 'prescription_items',   COUNT(*) FROM `prescription_items`
UNION ALL SELECT 'invoices',             COUNT(*) FROM `invoices`
UNION ALL SELECT 'invoice_items',        COUNT(*) FROM `invoice_items`
UNION ALL SELECT 'payments',             COUNT(*) FROM `payments`
UNION ALL SELECT 'shifts',               COUNT(*) FROM `shifts`
UNION ALL SELECT 'meetings',             COUNT(*) FROM `meetings`
UNION ALL SELECT 'lab_tests',            COUNT(*) FROM `lab_tests`
UNION ALL SELECT 'lab_requests',         COUNT(*) FROM `lab_requests`
UNION ALL SELECT 'notifications',        COUNT(*) FROM `notifications`
UNION ALL SELECT 'audit_logs',           COUNT(*) FROM `audit_logs`
UNION ALL SELECT 'clinic_settings',      COUNT(*) FROM `clinic_settings`;

-- Contrôle de cohérence : le stock calculé par les triggers ne doit jamais
-- devenir négatif et les totaux de facture doivent correspondre aux lignes.
SELECT COUNT(*) AS `stock_negatif` FROM `medications` WHERE `stock_quantity` < 0;
SELECT COUNT(*) AS `factures_incoherentes`
FROM `invoices` i
JOIN (SELECT `invoice_id`, ROUND(SUM(`line_total`), 2) AS `sub`
      FROM `invoice_items` GROUP BY `invoice_id`) t ON t.`invoice_id` = i.`id`
WHERE i.`subtotal` <> t.`sub`;

-- =============================================================================
-- Fin de 003_seed.sql
-- =============================================================================
