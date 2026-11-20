-- =============================================================================
-- 004_news.sql — mise à niveau : module « Actualités » et rôle « Rédacteur »
--
-- Script idempotent : peut être rejoué sur une base existante sans écraser les
-- articles rédigés depuis le back-office. Il est exécuté par reset-db.mjs après
-- 003_seed.sql, ce qui permet aussi de mettre à jour une installation déjà
-- peuplée (les INSERT IGNORE et la clé unique sur `slug` évitent les doublons).
-- =============================================================================

CREATE TABLE IF NOT EXISTS `news` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`         VARCHAR(200) NOT NULL,
  `title`        VARCHAR(180) NOT NULL,
  `category`     VARCHAR(60)  NOT NULL,
  `excerpt`      VARCHAR(500) NOT NULL,
  `content`      TEXT         NOT NULL,
  `key_points`   TEXT         NULL,
  `author`       VARCHAR(100) NOT NULL DEFAULT 'Équipe MediClinic',
  `read_time`    TINYINT UNSIGNED NOT NULL DEFAULT 4,
  `image_url`    VARCHAR(500) NULL,
  `status`       ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `published_at` DATETIME     NULL,
  `created_by`   INT UNSIGNED NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_news_slug` (`slug`),
  KEY `idx_news_status_published` (`status`, `published_at`),
  CONSTRAINT `fk_news_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Rôle dédié à la rédaction des actualités (id 9)
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO `roles` (`id`, `code`, `name`, `description`, `is_system`) VALUES
(9, 'NEWS_EDITOR', 'Rédacteur actualités', 'Rédaction et publication des actualités du site public', TRUE);

-- -----------------------------------------------------------------------------
-- Quatre permissions atomiques supplémentaires (ids 78 à 81)
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO `permissions` (`id`, `code`, `resource`, `action`, `description`) VALUES
(78, 'news:create', 'news', 'create', 'Rédiger une actualité'),
(79, 'news:read',   'news', 'read',   'Consulter les actualités'),
(80, 'news:update', 'news', 'update', 'Modifier une actualité'),
(81, 'news:delete', 'news', 'delete', 'Supprimer une actualité');

-- SUPER_ADMIN et ADMIN héritent de toutes les permissions ; le rédacteur ne
-- reçoit que celles de son périmètre (plus ses notifications).
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`resource` = 'news'
WHERE r.`code` IN ('SUPER_ADMIN', 'ADMIN', 'NEWS_EDITOR');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`code` IN ('notification:read', 'notification:update')
WHERE r.`code` = 'NEWS_EDITOR';

-- Retire un éventuel héritage « tableau de bord » sur une base déjà migrée :
-- un rédacteur ne doit pas voir les indicateurs financiers de la clinique.
DELETE rp FROM `role_permissions` rp
JOIN `roles` r ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
WHERE r.`code` = 'NEWS_EDITOR' AND p.`code` = 'dashboard:read';

-- -----------------------------------------------------------------------------
-- Compte de démonstration du rôle rédacteur
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO `users` (`id`, `email`, `password_hash`, `first_name`, `last_name`, `phone`, `is_active`) VALUES
(54, 'redaction@mediclinic.fr', '$2b$12$WH7cYvGsErB31hdkQy33b.h4BF8H6.Dkcsufw8k1DeRbDH3ggAiY.', 'Camille', 'Moreau', '0340000061', TRUE);

INSERT IGNORE INTO `user_roles` (`user_id`, `role_id`) VALUES (54, 9);

-- -----------------------------------------------------------------------------
-- Contenu initial (ignoré si les articles existent déjà)
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO `news`
  (`slug`, `title`, `category`, `excerpt`, `content`, `key_points`, `author`, `read_time`, `status`, `published_at`, `created_by`)
VALUES
('preparer-sa-consultation', 'Comment bien préparer sa consultation médicale', 'Conseils',
 'Une consultation efficace se prépare. Liste des symptômes, traitements en cours, questions à poser : nos conseils pour profiter pleinement du temps avec votre médecin.',
 JSON_ARRAY('Le temps d’une consultation est limité. Notez depuis quand les symptômes sont apparus, leur évolution et ce qui les aggrave ou les soulage.',
            'Apportez la liste de vos traitements en cours, y compris médicaments sans ordonnance et compléments alimentaires.',
            'Notez vos questions à l’avance : un simple mémo sur votre téléphone suffit.'),
 JSON_ARRAY('Notez la chronologie et l’intensité des symptômes.', 'Listez tous vos traitements.', 'Préparez deux ou trois questions prioritaires.', 'Apportez vos examens récents.'),
 'Dr Claire Martin', 4, 'PUBLISHED', '2026-11-12 09:00:00', 54),
('teleconsultation-mode-emploi', 'Téléconsultation : mode d’emploi et bonnes pratiques', 'Numérique',
 'La visioconférence médicale est pratique, mais elle nécessite un minimum de préparation. Voici comment rendre votre téléconsultation aussi utile qu’une consultation en présentiel.',
 JSON_ARRAY('La téléconsultation convient au suivi des maladies chroniques, au renouvellement d’ordonnances et à l’interprétation de résultats.',
            'Installez-vous dans un endroit calme et vérifiez votre connexion quelques minutes avant l’heure.',
            'Décrivez précisément vos symptômes et vérifiez la posologie à la fin de l’échange.'),
 JSON_ARRAY('Testez votre matériel avant le rendez-vous.', 'Préparez vos documents et vos constantes.', 'Choisissez un lieu calme et lumineux.', 'Demandez un compte-rendu écrit.'),
 'Équipe MediClinic', 5, 'PUBLISHED', '2026-10-28 09:00:00', 54),
('prevention-cardiovasculaire', 'Prévention cardiovasculaire : les gestes qui comptent', 'Prévention',
 'Activité physique, alimentation, sommeil, tension artérielle : les leviers concrets pour prendre soin de votre cœur au quotidien, à tout âge.',
 JSON_ARRAY('Une part importante des facteurs de risque cardiovasculaire est modifiable : tabac, sédentarité, surpoids, hypertension, diabète et cholestérol.',
            'Trente minutes d’activité physique modérée cinq fois par semaine réduisent significativement le risque.',
            'Privilégiez légumes, fruits et céréales complètes en limitant produits ultra-transformés, sel et alcool.'),
 JSON_ARRAY('Bouger au moins 30 minutes par jour.', 'Faire contrôler sa tension une fois par an.', 'Réduire sel, alcool et tabac.', 'Consulter en cas de douleur thoracique.'),
 'Dr Antoine Lefèvre', 6, 'PUBLISHED', '2026-10-09 09:00:00', 54),
('sommeil-et-sante', 'Sommeil et santé : reconstruire des nuits réparatrices', 'Bien-être',
 'Le manque de sommeil affecte l’humeur, l’immunité et le risque cardiométabolique. Quelques routines simples permettent souvent d’améliorer la qualité des nuits.',
 JSON_ARRAY('Un adulte a besoin de sept à neuf heures de sommeil ; la régularité des horaires est souvent plus importante que la durée.',
            'Évitez les écrans lumineux dans l’heure qui précède le coucher et la caféine après 14h.',
            'Si les difficultés durent plus de trois semaines, parlez-en à votre médecin.'),
 JSON_ARRAY('Se coucher et se lever à heures régulières.', 'Limiter les écrans le soir.', 'Éviter la caféine en fin de journée.', 'Consulter si les troubles persistent.'),
 'Dr Sophie Bernard', 5, 'PUBLISHED', '2026-09-22 09:00:00', 54),
('vaccination-adulte', 'Vaccination de l’adulte : êtes-vous à jour ?', 'Prévention',
 'Diphtérie, tétanos, coqueluche, grippe, zona… Les rappels vaccinaux concernent aussi les adultes. Faites le point avec votre médecin traitant.',
 JSON_ARRAY('Les recommandations vaccinales évoluent avec l’âge, la grossesse, les maladies chroniques ou les voyages.',
            'Le rappel diphtérie-tétanos-coqueluche est recommandé tous les vingt ans à l’âge adulte.',
            'La clinique propose des séances de vaccination sans rendez-vous certains après-midis.'),
 JSON_ARRAY('Vérifier son carnet de vaccination.', 'Rappel DTP tous les 20 ans.', 'Vaccination grippe chaque automne.', 'Signaler grossesse et maladies chroniques.'),
 'Dr Claire Martin', 4, 'PUBLISHED', '2026-09-03 09:00:00', 54),
('dossier-medical-numerique', 'Votre dossier médical numérique, mode d’emploi', 'Numérique',
 'Ordonnances, résultats d’analyses et comptes-rendus centralisés : découvrez comment utiliser votre espace patient et protéger vos identifiants.',
 JSON_ARRAY('Votre espace patient regroupe ordonnances, résultats de laboratoire, comptes-rendus et factures.',
            'L’accès est protégé par une authentification : ne partagez jamais votre mot de passe.',
            'Vous pouvez télécharger vos documents au format PDF pour les transmettre à un autre professionnel.'),
 JSON_ARRAY('Un seul espace pour tous vos documents.', 'Connexion sécurisée et journalisée.', 'Téléchargement PDF disponible.', 'Ne jamais partager ses identifiants.'),
 'Équipe MediClinic', 3, 'PUBLISHED', '2026-08-19 09:00:00', 54);

-- =============================================================================
-- Fin de 004_news.sql
-- =============================================================================
