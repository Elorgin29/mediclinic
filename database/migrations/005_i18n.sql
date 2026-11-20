-- =============================================================================
-- 005_i18n.sql — dictionnaire de traductions stocké en base
--
-- Les textes qui proviennent de la base (rôles, permissions, spécialités,
-- départements, notifications, actualités, identité de la clinique) sont
-- traduits ici pour les trois locales gérées par l'application.
-- La table est idempotente : INSERT ... ON DUPLICATE KEY UPDATE.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `translations` (
  `locale` VARCHAR(5)  NOT NULL,
  `key`    VARCHAR(190) NOT NULL,
  `value`  TEXT         NOT NULL,
  PRIMARY KEY (`locale`, `key`),
  KEY `idx_translations_key` (`key`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Rôles
-- -----------------------------------------------------------------------------
INSERT INTO `translations` (`locale`, `key`, `value`) VALUES
('fr', 'role.SUPER_ADMIN.description', 'Accès total, y compris la gestion de la matrice des rôles'),
('en', 'role.SUPER_ADMIN.description', 'Full access, including role matrix management'),
('mg', 'role.SUPER_ADMIN.description', 'Fahefana feno, anisan’izany ny fitantanana ny andraikitra'),
('fr', 'role.ADMIN.description', 'Gestion complète de la clinique hors matrice des rôles'),
('en', 'role.ADMIN.description', 'Full clinic management except the role matrix'),
('mg', 'role.ADMIN.description', 'Fitantanana feno ny tobim-pitsaboana afa-tsy ny andraikitra'),
('fr', 'role.DOCTOR.description', 'Consultations, ordonnances, téléconsultations'),
('en', 'role.DOCTOR.description', 'Consultations, prescriptions, teleconsultations'),
('mg', 'role.DOCTOR.description', 'Fizahana, ordonansa, fihaonana lavitra'),
('fr', 'role.NURSE.description', 'Accueil clinique, constantes, préparation des consultations'),
('en', 'role.NURSE.description', 'Clinic reception, vital signs, consultation preparation'),
('mg', 'role.NURSE.description', 'Fandraisana, famantarana, fanomanana ny fizahana'),
('fr', 'role.PHARMACIST.description', 'Catalogue, stock et dispensation des ordonnances'),
('en', 'role.PHARMACIST.description', 'Catalogue, stock and prescription dispensation'),
('mg', 'role.PHARMACIST.description', 'Lisitra, tahiry ary fanaterana fanafody'),
('fr', 'role.RECEPTIONIST.description', 'Accueil, rendez-vous, facturation au guichet'),
('en', 'role.RECEPTIONIST.description', 'Reception, appointments, counter billing'),
('mg', 'role.RECEPTIONIST.description', 'Fandraisana, fihaonana, faktiora eny amin’ny birao'),
('fr', 'role.ACCOUNTANT.description', 'Facturation, encaissements et rapports financiers'),
('en', 'role.ACCOUNTANT.description', 'Invoicing, payments and financial reports'),
('mg', 'role.ACCOUNTANT.description', 'Faktiora, fandoavana ary tatitra ara-bola'),
('fr', 'role.NEWS_EDITOR.description', 'Rédaction et publication des actualités du site public'),
('en', 'role.NEWS_EDITOR.description', 'Writing and publishing public website news'),
('mg', 'role.NEWS_EDITOR.description', 'Fanoratana sy famoahana vaovao ho an’ny tranonkala'),
('fr', 'role.PATIENT.description', 'Espace patient : rendez-vous, dossier, ordonnances'),
('en', 'role.PATIENT.description', 'Patient space: appointments, record, prescriptions'),
('mg', 'role.PATIENT.description', 'Efitry ny marary: fihaonana, rakitra, ordonansa')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- -----------------------------------------------------------------------------
-- Permissions (descriptions dérivées du code ressource:action)
-- -----------------------------------------------------------------------------
INSERT INTO `translations` (`locale`, `key`, `value`) VALUES
('en', 'permission.patient:create.description', 'Create a patient record'),
('en', 'permission.patient:read.description', 'View patient records'),
('en', 'permission.patient:update.description', 'Edit a patient record'),
('en', 'permission.patient:delete.description', 'Delete a patient record'),
('en', 'permission.appointment:create.description', 'Create an appointment'),
('en', 'permission.appointment:read.description', 'View appointments'),
('en', 'permission.appointment:update.description', 'Edit an appointment'),
('en', 'permission.appointment:delete.description', 'Delete an appointment'),
('en', 'permission.consultation:create.description', 'Create a consultation report'),
('en', 'permission.consultation:read.description', 'View consultation reports'),
('en', 'permission.consultation:update.description', 'Edit a consultation report'),
('en', 'permission.consultation:delete.description', 'Delete a consultation report'),
('en', 'permission.prescription:create.description', 'Write a prescription'),
('en', 'permission.prescription:read.description', 'View prescriptions'),
('en', 'permission.prescription:update.description', 'Edit a prescription'),
('en', 'permission.prescription:delete.description', 'Delete a prescription'),
('en', 'permission.invoice:create.description', 'Create an invoice'),
('en', 'permission.invoice:read.description', 'View invoices'),
('en', 'permission.invoice:update.description', 'Edit an invoice'),
('en', 'permission.invoice:delete.description', 'Delete an invoice'),
('en', 'permission.payment:create.description', 'Record a payment'),
('en', 'permission.payment:read.description', 'View payments'),
('en', 'permission.payment:update.description', 'Edit a payment'),
('en', 'permission.payment:delete.description', 'Delete a payment'),
('en', 'permission.medication:create.description', 'Add a medication'),
('en', 'permission.medication:read.description', 'View medications'),
('en', 'permission.medication:update.description', 'Edit a medication'),
('en', 'permission.medication:delete.description', 'Delete a medication'),
('en', 'permission.news:create.description', 'Write a news article'),
('en', 'permission.news:read.description', 'View news articles'),
('en', 'permission.news:update.description', 'Edit a news article'),
('en', 'permission.news:delete.description', 'Delete a news article'),
('en', 'permission.role:read.description', 'View roles and permissions'),
('en', 'permission.user:read.description', 'View users'),
('mg', 'permission.patient:create.description', 'Mamorona rakitry ny marary'),
('mg', 'permission.patient:read.description', 'Mijery ny rakitry ny marary'),
('mg', 'permission.patient:update.description', 'Manova rakitry ny marary'),
('mg', 'permission.patient:delete.description', 'Mamafa rakitry ny marary'),
('mg', 'permission.appointment:create.description', 'Mamorona fihaonana'),
('mg', 'permission.appointment:read.description', 'Mijery fihaonana'),
('mg', 'permission.appointment:update.description', 'Manova fihaonana'),
('mg', 'permission.appointment:delete.description', 'Mamafa fihaonana'),
('mg', 'permission.consultation:create.description', 'Mamorona tatitra fizahana'),
('mg', 'permission.consultation:read.description', 'Mijery tatitra fizahana'),
('mg', 'permission.invoice:create.description', 'Mamorona faktiora'),
('mg', 'permission.invoice:read.description', 'Mijery faktiora'),
('mg', 'permission.payment:create.description', 'Mirakitra fandoavana'),
('mg', 'permission.payment:read.description', 'Mijery fandoavana'),
('mg', 'permission.medication:create.description', 'Manampy fanafody'),
('mg', 'permission.medication:read.description', 'Mijery fanafody'),
('mg', 'permission.news:create.description', 'Manoratra lahatsoratra vaovao'),
('mg', 'permission.news:read.description', 'Mijery lahatsoratra vaovao'),
('mg', 'permission.news:update.description', 'Manova lahatsoratra vaovao'),
('mg', 'permission.news:delete.description', 'Mamafa lahatsoratra vaovao')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- -----------------------------------------------------------------------------
-- Spécialités
-- -----------------------------------------------------------------------------
INSERT INTO `translations` (`locale`, `key`, `value`) VALUES
('en', 'specialty.1.name', 'Cardiology'),
('mg', 'specialty.1.name', 'Aretin’ny fo'),
('en', 'specialty.1.description', 'Diagnosis and follow-up of cardiovascular diseases'),
('mg', 'specialty.1.description', 'Fizahana sy fanaraha-maso ny aretin’ny fo sy ny lalan-drà'),
('en', 'specialty.2.name', 'Dermatology'),
('mg', 'specialty.2.name', 'Aretin’ny hoditra'),
('en', 'specialty.3.name', 'Paediatrics'),
('mg', 'specialty.3.name', 'Aretin’ny ankizy'),
('en', 'specialty.4.name', 'Gynaecology and Obstetrics'),
('mg', 'specialty.4.name', 'Aretin’ny vehivavy sy ny fiterahana'),
('en', 'specialty.5.name', 'General medicine'),
('mg', 'specialty.5.name', 'Fitsaboana ankapobeny'),
('en', 'specialty.6.name', 'Neurology'),
('mg', 'specialty.6.name', 'Aretin’ny rafi-pitatitra'),
('en', 'specialty.7.name', 'Orthopaedic surgery'),
('mg', 'specialty.7.name', 'Fandidiana taolana'),
('en', 'specialty.8.name', 'Ophthalmology'),
('mg', 'specialty.8.name', 'Aretin’ny maso'),
('en', 'specialty.9.name', 'Radiology'),
('mg', 'specialty.9.name', 'Radiôlôjia'),
('en', 'specialty.10.name', 'Occupational medicine'),
('mg', 'specialty.10.name', 'Fitsaboana asa'),
('en', 'specialty.2.description', 'Skin, hair and nail conditions'),
('mg', 'specialty.2.description', 'Aretin’ny hoditra, volo ary hoho'),
('en', 'specialty.3.description', 'Follow-up of newborns, children and teenagers'),
('mg', 'specialty.3.description', 'Fanaraha-maso ny zaza vao teraka sy ny tanora'),
('en', 'specialty.4.description', "Women's health, pregnancy and prenatal care"),
('mg', 'specialty.4.description', 'Fahasalaman’ny vehivavy, fiterahana ary fikarakarana mialoha'),
('en', 'specialty.5.description', 'First-line care, prevention and overall follow-up'),
('mg', 'specialty.5.description', 'Fikarakarana voalohany, fisorohana ary fanaraha-maso ankapobeny'),
('en', 'specialty.6.description', 'Disorders of the central and peripheral nervous system'),
('mg', 'specialty.6.description', 'Aretin’ny rafi-pitatitra foibe sy manodidina'),
('en', 'specialty.7.description', 'Locomotor system, traumatology and rehabilitation'),
('mg', 'specialty.7.description', 'Rafitra mihetsika, ratra ary famerenana amin’ny laoniny'),
('en', 'specialty.8.description', 'Vision, eyeball and related structures'),
('mg', 'specialty.8.description', 'Fahitana, maso ary ny manodidina azy'),
('en', 'specialty.9.description', 'Medical imaging and functional explorations'),
('mg', 'specialty.9.description', 'Sary ara-pitsaboana sy fizahana miasa'),
('en', 'specialty.10.description', 'Prevention of work-related health risks'),
('mg', 'specialty.10.description', 'Fisorohana ny loza ara-pahasalamana mifandray amin’ny asa')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- -----------------------------------------------------------------------------
-- Départements
-- -----------------------------------------------------------------------------
INSERT INTO `translations` (`locale`, `key`, `value`) VALUES
('en', 'department.1.name', 'Cardiology'),
('mg', 'department.1.name', 'Aretin’ny fo'),
('en', 'department.2.name', 'Paediatrics'),
('mg', 'department.2.name', 'Aretin’ny ankizy'),
('en', 'department.3.name', 'General medicine'),
('mg', 'department.3.name', 'Fitsaboana ankapobeny'),
('en', 'department.4.name', 'Dermatology'),
('mg', 'department.4.name', 'Aretin’ny hoditra'),
('en', 'department.5.name', 'Gynaecology'),
('mg', 'department.5.name', 'Aretin’ny vehivavy'),
('en', 'department.6.name', 'Neurology'),
('mg', 'department.6.name', 'Aretin’ny rafi-pitatitra'),
('en', 'department.7.name', 'Orthopaedics'),
('mg', 'department.7.name', 'Taolana'),
('en', 'department.8.name', 'Radiology'),
('mg', 'department.8.name', 'Radiôlôjia')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- -----------------------------------------------------------------------------
-- Identité de la clinique et notifications
-- -----------------------------------------------------------------------------
INSERT INTO `translations` (`locale`, `key`, `value`) VALUES
('en', 'clinic.name', 'MediClinic Clinic'),
('mg', 'clinic.name', 'Tokotokon’i MediClinic'),
('en', 'notification.NEW_TELECONSULTATION.title', 'New teleconsultation request'),
('mg', 'notification.NEW_TELECONSULTATION.title', 'Fangatahana fihaonana lavitra vaovao'),
('en', 'notification.APPOINTMENT_CONFIRMED.title', 'Appointment confirmed'),
('mg', 'notification.APPOINTMENT_CONFIRMED.title', 'Fihaonana voamarina'),
('en', 'notification.LOW_STOCK.title', 'Low stock alert'),
('mg', 'notification.LOW_STOCK.title', 'Fampitandremana tahiry ambany'),
('en', 'notification.OVERDUE_INVOICE.title', 'Overdue invoice'),
('mg', 'notification.OVERDUE_INVOICE.title', 'Faktiora tara'),
('en', 'notification.PRESCRIPTION_TO_DISPENSE.title', 'Prescription to dispense'),
('mg', 'notification.PRESCRIPTION_TO_DISPENSE.title', 'Ordonansa haterina'),
('en', 'notification.NEW_PATIENT.title', 'New patient registered'),
('mg', 'notification.NEW_PATIENT.title', 'Marary vaovao voasoratra')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- -----------------------------------------------------------------------------
-- Actualités (titres et résumés)
-- -----------------------------------------------------------------------------
INSERT INTO `translations` (`locale`, `key`, `value`) VALUES
('en', 'news.preparer-sa-consultation.title', 'How to prepare for your medical appointment'),
('mg', 'news.preparer-sa-consultation.title', 'Ahoana ny fiomanana amin’ny fizahana'),
('en', 'news.preparer-sa-consultation.excerpt', 'A good appointment starts with preparation: symptoms, current treatments and questions to ask.'),
('mg', 'news.preparer-sa-consultation.excerpt', 'Ny fizahana tsara dia manomboka amin’ny fiomanana: aretina, fanafody ary fanontaniana.'),
('en', 'news.teleconsultation-mode-emploi.title', 'Teleconsultation: how it works and best practices'),
('mg', 'news.teleconsultation-mode-emploi.title', 'Fihaonana lavitra: fomba fiasa sy torohevitra'),
('en', 'news.prevention-cardiovasculaire.title', 'Cardiovascular prevention: the habits that matter'),
('mg', 'news.prevention-cardiovasculaire.title', 'Fisorohana aretin’ny fo: ny fomba mahasoa'),
('en', 'news.sommeil-et-sante.title', 'Sleep and health: rebuilding restful nights'),
('mg', 'news.sommeil-et-sante.title', 'Torimaso sy fahasalamana: torimaso mahasoa'),
('en', 'news.vaccination-adulte.title', 'Adult vaccination: are you up to date?'),
('mg', 'news.vaccination-adulte.title', 'Vaksinin’ny olon-dehibe: efa voavaksinina ve ianao?'),
('en', 'news.dossier-medical-numerique.title', 'Your digital medical record: a user guide'),
('mg', 'news.dossier-medical-numerique.title', 'Ny rakitra ara-pahasalamana nomerika: torolàlana')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- =============================================================================
-- Fin de 005_i18n.sql
-- =============================================================================
