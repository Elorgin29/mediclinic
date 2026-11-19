-- =============================================================================
--  MediClinic — 002_views.sql
--  Vues SQL : dénormalisation en lecture pour l'API et les rapports.
--
--  Toutes les vues sont en lecture seule (pas d'ALGORITHM=MERGE sur les
--  agrégats) et servent de contrat stable entre la base et le back-end :
--  les repositories peuvent évoluer sans casser les écrans.
-- =============================================================================

USE `mediclinic`;

SET FOREIGN_KEY_CHECKS = 0;

DROP VIEW IF EXISTS `v_dashboard_stats`;
DROP VIEW IF EXISTS `v_revenue_by_month`;
DROP VIEW IF EXISTS `v_appointments_by_department`;
DROP VIEW IF EXISTS `v_consultations_by_doctor`;
DROP VIEW IF EXISTS `v_top_medications`;
DROP VIEW IF EXISTS `v_low_stock_medications`;
DROP VIEW IF EXISTS `v_patient_history`;
DROP VIEW IF EXISTS `v_invoice_details`;
DROP VIEW IF EXISTS `v_prescription_details`;
DROP VIEW IF EXISTS `v_consultation_details`;
DROP VIEW IF EXISTS `v_appointment_details`;
DROP VIEW IF EXISTS `v_doctor_directory`;
DROP VIEW IF EXISTS `v_active_meetings`;
DROP VIEW IF EXISTS `v_shift_calendar`;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- 1. v_doctor_directory
--    Annuaire public des médecins : évite d'exposer users.password_hash.
-- -----------------------------------------------------------------------------
CREATE VIEW `v_doctor_directory` AS
SELECT
  d.`id`                    AS doctor_id,
  d.`user_id`               AS user_id,
  CONCAT('Dr ', u.`first_name`, ' ', u.`last_name`) AS full_name,
  u.`first_name`,
  u.`last_name`,
  u.`email`,
  u.`phone`,
  s.`id`                    AS specialty_id,
  s.`name`                  AS specialty_name,
  dp.`id`                   AS department_id,
  dp.`name`                 AS department_name,
  d.`license_number`,
  d.`consultation_fee`,
  d.`bio`,
  d.`is_accepting_patients`,
  d.`created_at`
FROM `doctors` d
JOIN `users` u        ON u.`id` = d.`user_id`
JOIN `specialties` s  ON s.`id` = d.`specialty_id`
LEFT JOIN `departments` dp ON dp.`id` = d.`department_id`
WHERE u.`is_active` = TRUE;

-- -----------------------------------------------------------------------------
-- 2. v_appointment_details
--    Rendez-vous enrichi patient + médecin, pour les listes et l'agenda.
-- -----------------------------------------------------------------------------
CREATE VIEW `v_appointment_details` AS
SELECT
  a.`id`,
  a.`patient_id`,
  a.`doctor_id`,
  a.`department_id`,
  a.`scheduled_at`,
  a.`duration`,
  a.`status`,
  a.`type`,
  a.`reason`,
  a.`notes`,
  a.`cancelled_reason`,
  a.`created_at`,
  a.`updated_at`,
  DATE(a.`scheduled_at`)                          AS appointment_date,
  ADDTIME(a.`scheduled_at`, SEC_TO_TIME(a.`duration` * 60)) AS ends_at,
  CONCAT(p.`first_name`, ' ', p.`last_name`)      AS patient_name,
  p.`first_name`                                  AS patient_first_name,
  p.`last_name`                                   AS patient_last_name,
  p.`phone`                                       AS patient_phone,
  p.`email`                                       AS patient_email,
  p.`birth_date`                                  AS patient_birth_date,
  CONCAT('Dr ', du.`first_name`, ' ', du.`last_name`) AS doctor_name,
  s.`name`                                        AS specialty_name,
  dp.`name`                                       AS department_name,
  c.`id`                                          AS consultation_id,
  m.`id`                                          AS meeting_id,
  m.`status`                                      AS meeting_status,
  m.`zoom_meeting_id`
FROM `appointments` a
JOIN `patients` p     ON p.`id` = a.`patient_id`
JOIN `doctors` d      ON d.`id` = a.`doctor_id`
JOIN `users` du       ON du.`id` = d.`user_id`
JOIN `specialties` s  ON s.`id` = d.`specialty_id`
LEFT JOIN `departments` dp ON dp.`id` = a.`department_id`
LEFT JOIN `consultations` c ON c.`appointment_id` = a.`id`
LEFT JOIN `meetings` m      ON m.`appointment_id` = a.`id`;

-- -----------------------------------------------------------------------------
-- 3. v_consultation_details
-- -----------------------------------------------------------------------------
CREATE VIEW `v_consultation_details` AS
SELECT
  c.`id`,
  c.`appointment_id`,
  c.`doctor_id`,
  c.`diagnosis`,
  c.`notes`,
  c.`follow_up_at`,
  c.`created_at`,
  a.`patient_id`,
  a.`scheduled_at`,
  a.`type`                                        AS appointment_type,
  CONCAT(p.`first_name`, ' ', p.`last_name`)      AS patient_name,
  p.`birth_date`                                  AS patient_birth_date,
  CONCAT('Dr ', du.`first_name`, ' ', du.`last_name`) AS doctor_name,
  s.`name`                                        AS specialty_name,
  (SELECT COUNT(*) FROM `prescriptions` pr WHERE pr.`consultation_id` = c.`id`) AS prescriptions_count,
  (SELECT COUNT(*) FROM `invoices` i WHERE i.`consultation_id` = c.`id`)        AS invoices_count
FROM `consultations` c
JOIN `appointments` a ON a.`id` = c.`appointment_id`
JOIN `patients` p     ON p.`id` = a.`patient_id`
JOIN `doctors` d      ON d.`id` = c.`doctor_id`
JOIN `users` du       ON du.`id` = d.`user_id`
JOIN `specialties` s  ON s.`id` = d.`specialty_id`;

-- -----------------------------------------------------------------------------
-- 4. v_prescription_details
-- -----------------------------------------------------------------------------
CREATE VIEW `v_prescription_details` AS
SELECT
  pr.`id`,
  pr.`consultation_id`,
  pr.`doctor_id`,
  pr.`issued_at`,
  pr.`status`,
  c.`appointment_id`,
  a.`patient_id`,
  CONCAT(p.`first_name`, ' ', p.`last_name`)      AS patient_name,
  CONCAT('Dr ', du.`first_name`, ' ', du.`last_name`) AS doctor_name,
  s.`name`                                        AS specialty_name,
  (SELECT COUNT(*) FROM `prescription_items` pi WHERE pi.`prescription_id` = pr.`id`) AS items_count,
  (SELECT COALESCE(SUM(pi.`quantity`), 0)
     FROM `prescription_items` pi WHERE pi.`prescription_id` = pr.`id`)               AS total_quantity
FROM `prescriptions` pr
JOIN `consultations` c ON c.`id` = pr.`consultation_id`
JOIN `appointments` a  ON a.`id` = c.`appointment_id`
JOIN `patients` p      ON p.`id` = a.`patient_id`
JOIN `doctors` d       ON d.`id` = pr.`doctor_id`
JOIN `users` du        ON du.`id` = d.`user_id`
JOIN `specialties` s   ON s.`id` = d.`specialty_id`;

-- -----------------------------------------------------------------------------
-- 5. v_invoice_details
-- -----------------------------------------------------------------------------
CREATE VIEW `v_invoice_details` AS
SELECT
  i.`id`,
  i.`number`,
  i.`patient_id`,
  i.`consultation_id`,
  i.`subtotal`,
  i.`vat_rate`,
  i.`vat_amount`,
  i.`total_amount`,
  i.`paid_amount`,
  ROUND(i.`total_amount` - i.`paid_amount`, 2)    AS balance_due,
  i.`status`,
  i.`issued_at`,
  i.`due_date`,
  i.`created_at`,
  i.`updated_at`,
  CONCAT(p.`first_name`, ' ', p.`last_name`)      AS patient_name,
  p.`email`                                       AS patient_email,
  p.`phone`                                       AS patient_phone,
  p.`address`                                     AS patient_address,
  p.`city`                                        AS patient_city,
  p.`postal_code`                                 AS patient_postal_code,
  (SELECT COUNT(*) FROM `invoice_items` ii WHERE ii.`invoice_id` = i.`id`) AS items_count,
  (i.`due_date` < CURDATE() AND i.`status` NOT IN ('PAID', 'CANCELLED'))   AS is_overdue
FROM `invoices` i
JOIN `patients` p ON p.`id` = i.`patient_id`;

-- -----------------------------------------------------------------------------
-- 6. v_patient_history
--    Dossier patient consolidé : une ligne par événement (RDV, consultation,
--    ordonnance, facture, résultat labo). Utilisée par GET /api/patients/:id/history.
-- -----------------------------------------------------------------------------
CREATE VIEW `v_patient_history` AS
SELECT
  a.`patient_id`                                  AS patient_id,
  'APPOINTMENT'                                   AS entry_type,
  a.`id`                                          AS entry_id,
  a.`scheduled_at`                                AS event_date,
  CONCAT('Rendez-vous — ', COALESCE(a.`reason`, 'sans motif')) AS title,
  CONCAT('Dr ', du.`first_name`, ' ', du.`last_name`,
         ' · ', s.`name`, ' · ', a.`status`)      AS description
FROM `appointments` a
JOIN `doctors` d  ON d.`id` = a.`doctor_id`
JOIN `users` du   ON du.`id` = d.`user_id`
JOIN `specialties` s ON s.`id` = d.`specialty_id`

UNION ALL

SELECT
  a.`patient_id`,
  'CONSULTATION',
  c.`id`,
  c.`created_at`,
  'Consultation médicale',
  LEFT(c.`diagnosis`, 240)
FROM `consultations` c
JOIN `appointments` a ON a.`id` = c.`appointment_id`

UNION ALL

SELECT
  a.`patient_id`,
  'PRESCRIPTION',
  pr.`id`,
  pr.`issued_at`,
  CONCAT('Ordonnance #', pr.`id`),
  CONCAT('Dr ', du.`first_name`, ' ', du.`last_name`, ' · ', pr.`status`,
         ' · ', (SELECT COUNT(*) FROM `prescription_items` pi WHERE pi.`prescription_id` = pr.`id`),
         ' médicament(s)')
FROM `prescriptions` pr
JOIN `consultations` c ON c.`id` = pr.`consultation_id`
JOIN `appointments` a  ON a.`id` = c.`appointment_id`
JOIN `doctors` d       ON d.`id` = pr.`doctor_id`
JOIN `users` du        ON du.`id` = d.`user_id`

UNION ALL

SELECT
  i.`patient_id`,
  'INVOICE',
  i.`id`,
  i.`issued_at`,
  CONCAT('Facture ', i.`number`),
  CONCAT(i.`total_amount`, ' · ', i.`status`)
FROM `invoices` i

UNION ALL

SELECT
  lr.`patient_id`,
  'LAB_REQUEST',
  lr.`id`,
  lr.`requested_at`,
  CONCAT('Analyse — ', lt.`name`),
  CONCAT(lt.`category`, ' · ', lr.`status`)
FROM `lab_requests` lr
JOIN `lab_tests` lt ON lt.`id` = lr.`lab_test_id`;

-- -----------------------------------------------------------------------------
-- 7. v_low_stock_medications
-- -----------------------------------------------------------------------------
CREATE VIEW `v_low_stock_medications` AS
SELECT
  m.`id`,
  m.`name`,
  m.`category`,
  m.`unit`,
  m.`price`,
  m.`stock_quantity`,
  m.`alert_threshold`,
  m.`expiry_date`,
  m.`supplier`,
  (m.`alert_threshold` - m.`stock_quantity`)                       AS missing_quantity,
  (m.`expiry_date` IS NOT NULL AND m.`expiry_date` < CURDATE())    AS is_expired,
  (m.`expiry_date` IS NOT NULL
    AND m.`expiry_date` >= CURDATE()
    AND m.`expiry_date` <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))   AS expires_soon
FROM `medications` m
WHERE m.`stock_quantity` <= m.`alert_threshold`;

-- -----------------------------------------------------------------------------
-- 8. v_top_medications
--    Médicaments les plus prescrits (sur toute la période disponible).
-- -----------------------------------------------------------------------------
CREATE VIEW `v_top_medications` AS
SELECT
  m.`id`                                   AS medication_id,
  m.`name`,
  m.`category`,
  m.`unit`,
  COUNT(DISTINCT pi.`prescription_id`)     AS prescriptions_count,
  COALESCE(SUM(pi.`quantity`), 0)          AS total_quantity
FROM `medications` m
LEFT JOIN `prescription_items` pi ON pi.`medication_id` = m.`id`
GROUP BY m.`id`, m.`name`, m.`category`, m.`unit`;

-- -----------------------------------------------------------------------------
-- 9. v_revenue_by_month
--    Chiffre d'affaires encaissé par mois (base : paiements).
-- -----------------------------------------------------------------------------
CREATE VIEW `v_revenue_by_month` AS
SELECT
  DATE_FORMAT(p.`paid_at`, '%Y-%m')        AS period,
  DATE_FORMAT(p.`paid_at`, '%Y-%m-01')     AS period_start,
  COUNT(DISTINCT p.`invoice_id`)           AS invoices_count,
  COUNT(p.`id`)                            AS payments_count,
  ROUND(SUM(p.`amount`), 2)                AS revenue
FROM `payments` p
GROUP BY DATE_FORMAT(p.`paid_at`, '%Y-%m'), DATE_FORMAT(p.`paid_at`, '%Y-%m-01');

-- -----------------------------------------------------------------------------
-- 10. v_appointments_by_department
-- -----------------------------------------------------------------------------
CREATE VIEW `v_appointments_by_department` AS
SELECT
  COALESCE(dp.`id`, 0)                     AS department_id,
  COALESCE(dp.`name`, 'Non affecté')       AS department_name,
  COUNT(a.`id`)                            AS appointments_count,
  SUM(CASE WHEN a.`status` = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count,
  SUM(CASE WHEN a.`status` = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_count,
  SUM(CASE WHEN a.`status` = 'NO_SHOW'   THEN 1 ELSE 0 END) AS no_show_count
FROM `appointments` a
LEFT JOIN `departments` dp ON dp.`id` = a.`department_id`
GROUP BY dp.`id`, dp.`name`;

-- -----------------------------------------------------------------------------
-- 11. v_consultations_by_doctor
-- -----------------------------------------------------------------------------
CREATE VIEW `v_consultations_by_doctor` AS
SELECT
  d.`id`                                   AS doctor_id,
  CONCAT('Dr ', u.`first_name`, ' ', u.`last_name`) AS doctor_name,
  s.`name`                                 AS specialty_name,
  COUNT(c.`id`)                            AS consultations_count,
  ROUND(SUM(d.`consultation_fee`), 2)      AS theoretical_revenue
FROM `doctors` d
JOIN `users` u       ON u.`id` = d.`user_id`
JOIN `specialties` s ON s.`id` = d.`specialty_id`
LEFT JOIN `consultations` c ON c.`doctor_id` = d.`id`
GROUP BY d.`id`, u.`first_name`, u.`last_name`, s.`name`, d.`consultation_fee`;

-- -----------------------------------------------------------------------------
-- 12. v_shift_calendar
--    Planning de gardes enrichi, pour GET /api/shifts/calendar.
-- -----------------------------------------------------------------------------
CREATE VIEW `v_shift_calendar` AS
SELECT
  sh.`id`,
  sh.`doctor_id`,
  sh.`department_id`,
  sh.`start_at`,
  sh.`end_at`,
  sh.`type`,
  sh.`status`,
  sh.`notes`,
  DATE(sh.`start_at`)                                          AS shift_date,
  DATE_FORMAT(sh.`start_at`, '%H:%i')                          AS start_time,
  DATE_FORMAT(sh.`end_at`, '%H:%i')                            AS end_time,
  ROUND(TIMESTAMPDIFF(MINUTE, sh.`start_at`, sh.`end_at`) / 60, 1) AS hours,
  CONCAT('Dr ', u.`first_name`, ' ', u.`last_name`)            AS doctor_name,
  s.`name`                                                     AS specialty_name,
  dp.`name`                                                    AS department_name
FROM `shifts` sh
JOIN `doctors` d      ON d.`id` = sh.`doctor_id`
JOIN `users` u        ON u.`id` = d.`user_id`
JOIN `specialties` s  ON s.`id` = d.`specialty_id`
JOIN `departments` dp ON dp.`id` = sh.`department_id`;

-- -----------------------------------------------------------------------------
-- 13. v_active_meetings
--    Téléconsultations dont la fenêtre de connexion est ouverte ou proche.
-- -----------------------------------------------------------------------------
CREATE VIEW `v_active_meetings` AS
SELECT
  m.`id`,
  m.`patient_id`,
  m.`doctor_id`,
  m.`appointment_id`,
  m.`reason`,
  m.`preferred_at`,
  m.`duration`,
  m.`status`,
  m.`zoom_meeting_id`,
  m.`join_url`,
  m.`start_time`,
  ADDTIME(m.`start_time`, SEC_TO_TIME(m.`duration` * 60))        AS ends_at,
  CONCAT(p.`first_name`, ' ', p.`last_name`)                     AS patient_name,
  CONCAT('Dr ', u.`first_name`, ' ', u.`last_name`)              AS doctor_name,
  (m.`status` = 'APPROVED'
    AND NOW() BETWEEN DATE_SUB(m.`start_time`, INTERVAL 10 MINUTE)
                  AND ADDTIME(m.`start_time`, SEC_TO_TIME(m.`duration` * 60))) AS is_joinable
FROM `meetings` m
JOIN `patients` p  ON p.`id` = m.`patient_id`
JOIN `doctors` d   ON d.`id` = m.`doctor_id`
JOIN `users` u     ON u.`id` = d.`user_id`;

-- -----------------------------------------------------------------------------
-- 14. v_dashboard_stats
--    Indicateurs de la page d'accueil admin (GET /api/dashboard/stats).
--    Vue à une seule ligne.
-- -----------------------------------------------------------------------------
CREATE VIEW `v_dashboard_stats` AS
SELECT
  (SELECT COUNT(*) FROM `patients`)                                   AS patients_total,
  (SELECT COUNT(*) FROM `doctors`)                                    AS doctors_total,
  (SELECT COUNT(*) FROM `appointments` WHERE DATE(`scheduled_at`) = CURDATE()) AS appointments_today,
  (SELECT COUNT(*) FROM `appointments`
    WHERE `scheduled_at` >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
      AND `scheduled_at` <  DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY))
                                                                      AS appointments_week,
  (SELECT COUNT(*) FROM `appointments`
    WHERE `scheduled_at` >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      AND `scheduled_at` <  DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH))
                                                                      AS appointments_month,
  (SELECT COALESCE(SUM(`amount`), 0) FROM `payments`
    WHERE `paid_at` >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      AND `paid_at` <  DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH))
                                                                      AS revenue_month,
  (SELECT COALESCE(SUM(`amount`), 0) FROM `payments`
    WHERE `paid_at` >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
      AND `paid_at` <  DATE_FORMAT(CURDATE(), '%Y-%m-01'))            AS revenue_previous_month,
  (SELECT COUNT(*) FROM `meetings` WHERE `status` = 'PENDING')        AS pending_meetings,
  (SELECT COUNT(*) FROM `medications` WHERE `stock_quantity` <= `alert_threshold`)
                                                                      AS low_stock_count,
  (SELECT COUNT(*) FROM `shifts`
    WHERE NOW() BETWEEN `start_at` AND `end_at`
      AND `status` IN ('SCHEDULED', 'CONFIRMED'))                     AS shifts_in_progress,
  (SELECT COUNT(*) FROM `invoices`
    WHERE `status` NOT IN ('PAID', 'CANCELLED') AND `due_date` < CURDATE())
                                                                      AS overdue_invoices;

-- =============================================================================
-- Fin de 002_views.sql
-- Étape suivante : 003_seed.sql
-- =============================================================================
