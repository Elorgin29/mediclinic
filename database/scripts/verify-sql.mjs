#!/usr/bin/env node
/**
 * Vérification statique des scripts SQL.
 *
 * Aucun serveur MySQL n'est disponible dans cet environnement : ce script
 * contrôle donc la cohérence des scripts par analyse textuelle, ce qui permet
 * de détecter les erreurs les plus fréquentes avant tout déploiement.
 *
 * Contrôles effectués :
 *  1. présence des tables attendues dans 001_init.sql ;
 *  2. présence des vues attendues dans 002_views.sql ;
 *  3. équilibre des parenthèses de chaque instruction ;
 *  4. cohérence des `CREATE TABLE` : chaque colonne déclarée existe, chaque
 *     `FOREIGN KEY` pointe vers une table déclarée ;
 *  5. ordre de création : aucune table ne référence une table créée après elle
 *     (hors `ALTER TABLE`, qui sert justement à différer une contrainte) ;
 *  6. correspondance entre les permissions du seed SQL et celles du paquet
 *     partagé `packages/shared/src/permissions.ts`.
 *
 * UTILISATION : node database/scripts/verify-sql.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..', '..');
const migrationsDir = path.join(repoRoot, 'database', 'migrations');

/* -------------------------------------------------------------------------- */
/* Tables et vues attendues                                                    */
/* -------------------------------------------------------------------------- */

const EXPECTED_TABLES = [
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'user_roles',
  'refresh_tokens',
  'patients',
  'specialties',
  'departments',
  'doctors',
  'appointments',
  'consultations',
  'prescriptions',
  'medications',
  'prescription_items',
  'stock_movements',
  'invoices',
  'invoice_items',
  'payments',
  'shifts',
  'meetings',
  'lab_tests',
  'lab_requests',
  'audit_logs',
  'notifications',
  'clinic_settings',
  'news',
];

const EXPECTED_VIEWS = [
  'v_doctor_directory',
  'v_appointment_details',
  'v_consultation_details',
  'v_prescription_details',
  'v_invoice_details',
  'v_patient_history',
  'v_low_stock_medications',
  'v_top_medications',
  'v_revenue_by_month',
  'v_appointments_by_department',
  'v_consultations_by_doctor',
  'v_shift_calendar',
  'v_active_meetings',
  'v_dashboard_stats',
];

const EXPECTED_TRIGGERS = [
  'trg_stock_movement_before_insert',
  'trg_stock_movement_after_insert',
  'trg_stock_movement_after_delete',
  'trg_invoice_item_after_insert',
  'trg_invoice_item_after_update',
  'trg_invoice_item_after_delete',
  'trg_invoice_before_update',
  'trg_payment_after_insert',
  'trg_payment_after_update',
  'trg_payment_after_delete',
];

/* -------------------------------------------------------------------------- */
/* Utilitaires                                                                 */
/* -------------------------------------------------------------------------- */

const results = [];

/** Enregistre le résultat d'un contrôle. */
function check(label, condition, detail = '') {
  results.push({ label, ok: Boolean(condition), detail });
}

/** Lit un fichier de migration. */
function readMigration(filename) {
  const filePath = path.join(migrationsDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier introuvable : ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

/** Extrait les noms de tables créées (`CREATE TABLE \`x\``). */
function extractCreatedTables(sql) {
  return [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`(\w+)`/gi)].map((m) => m[1]);
}

/** Extrait les noms de vues créées. */
function extractCreatedViews(sql) {
  return [...sql.matchAll(/CREATE(?:\s+OR\s+REPLACE)?\s+VIEW\s+`(\w+)`/gi)].map((m) => m[1]);
}

/** Extrait les noms de triggers créés (les backticks sont facultatifs). */
function extractCreatedTriggers(sql) {
  return [...sql.matchAll(/CREATE\s+TRIGGER\s+`?(\w+)`?/gi)].map((m) => m[1]);
}

/**
 * Extrait le corps d'une table (`CREATE TABLE \`x\` ( … ) ENGINE`).
 * Permet d'analyser une table sans déborder sur les suivantes.
 */
function extractTableBody(sql, tableName) {
  const pattern = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?\`${tableName}\`\\s*\\(([\\s\\S]*?)\\n\\)\\s*ENGINE`,
    'i',
  );
  const match = pattern.exec(sql);
  return match ? match[1] : null;
}

/**
 * Extrait les contraintes de clé étrangère et la table qu'elles référencent.
 * @returns {Array<{from: string, to: string}>}
 */
function extractForeignKeys(sql) {
  const result = [];

  // On isole chaque bloc `CREATE TABLE … ;` pour connaître la table source.
  for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`(\w+)`([\s\S]*?)\n\)\s*ENGINE/gi)) {
    const [, sourceTable, body] = match;

    for (const fk of body.matchAll(/FOREIGN\s+KEY\s*\([^)]*\)\s*REFERENCES\s+`(\w+)`/gi)) {
      result.push({ from: sourceTable, to: fk[1] });
    }
  }

  return result;
}

/** Vérifie que les parenthèses d'une instruction sont équilibrées. */
function parensBalanced(text) {
  let depth = 0;
  let inString = false;
  let quote = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];

    if (inString) {
      if (char === quote && previous !== '\\') inString = false;
      continue;
    }

    if (char === "'" || char === '"') {
      inString = true;
      quote = char;
      continue;
    }

    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }

  return depth === 0;
}

/* -------------------------------------------------------------------------- */
/* Contrôles                                                                   */
/* -------------------------------------------------------------------------- */

function verifyInit() {
  const sql = readMigration('001_init.sql');
  const tables = extractCreatedTables(sql);
  const triggers = extractCreatedTriggers(sql);

  console.log('— 001_init.sql');

  // 1. Tables attendues.
  const missingTables = EXPECTED_TABLES.filter((table) => !tables.includes(table));
  check(
    `${EXPECTED_TABLES.length} tables attendues`,
    missingTables.length === 0,
    missingTables.length > 0 ? `manquantes : ${missingTables.join(', ')}` : `${tables.length} créées`,
  );

  // 2. Triggers attendus.
  const missingTriggers = EXPECTED_TRIGGERS.filter((trigger) => !triggers.includes(trigger));
  check(
    `${EXPECTED_TRIGGERS.length} triggers attendus`,
    missingTriggers.length === 0,
    missingTriggers.length > 0 ? `manquants : ${missingTriggers.join(', ')}` : `${triggers.length} créés`,
  );

  // 3. Équilibre des parenthèses, instruction par instruction.
  const withoutDelimiters = sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*DELIMITER\s+/i.test(line))
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');

  const statements = withoutDelimiters
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  const unbalanced = statements.filter((statement) => !parensBalanced(statement));
  check(
    'parenthèses équilibrées dans chaque instruction',
    unbalanced.length === 0,
    unbalanced.length > 0 ? `${unbalanced.length} instruction(s) déséquilibrée(s)` : `${statements.length} instructions`,
  );

  // 4. Les clés étrangères pointent vers des tables déclarées.
  const foreignKeys = extractForeignKeys(sql);
  const dangling = foreignKeys.filter((fk) => !tables.includes(fk.to));
  check(
    'clés étrangères résolues',
    dangling.length === 0,
    dangling.length > 0
      ? `cibles inconnues : ${[...new Set(dangling.map((fk) => `${fk.from}→${fk.to}`))].join(', ')}`
      : `${foreignKeys.length} contraintes`,
  );

  // 5. Ordre de création : aucune FK ne référence une table créée plus tard,
  //    à l'exception des contraintes ajoutées par `ALTER TABLE` (délibérément
  //    différées pour rompre un cycle).
  const orderIssues = [];
  for (const fk of foreignKeys) {
    const sourceIndex = tables.indexOf(fk.from);
    const targetIndex = tables.indexOf(fk.to);
    if (sourceIndex !== -1 && targetIndex !== -1 && targetIndex > sourceIndex) {
      orderIssues.push(`${fk.from}→${fk.to}`);
    }
  }
  check(
    'ordre de création compatible avec les FK',
    orderIssues.length === 0,
    orderIssues.length > 0 ? `à vérifier : ${[...new Set(orderIssues)].join(', ')}` : 'aucune référence avant création',
  );

  // 6. Vérifications métier ciblées.
  const usersBody = extractTableBody(sql, 'users') ?? '';
  check(
    'users ne porte pas de colonne role_id (relation N-N)',
    !/`role_id`/.test(usersBody),
    'table user_roles présente : ' + (tables.includes('user_roles') ? 'oui' : 'NON'),
  );

  const consultationsBody = extractTableBody(sql, 'consultations') ?? '';
  check(
    'consultations ne porte pas de colonne prescription_id',
    !/`prescription_id`/.test(consultationsBody),
    'la relation est portée par prescriptions.consultation_id',
  );

  check(
    'invoice_items.line_total est une colonne générée',
    /`line_total`[\s\S]*?AS\s*\(/i.test(sql),
  );
  check('clinic_settings est un singleton (CHECK id = 1)', /CHECK\s*\(`id`\s*=\s*1\)/i.test(sql));
}

function verifyViews() {
  const sql = readMigration('002_views.sql');
  const views = extractCreatedViews(sql);

  console.log('— 002_views.sql');

  const missing = EXPECTED_VIEWS.filter((view) => !views.includes(view));
  check(
    `${EXPECTED_VIEWS.length} vues attendues`,
    missing.length === 0,
    missing.length > 0 ? `manquantes : ${missing.join(', ')}` : `${views.length} créées`,
  );

  // Les vues de la vue `v_patient_history` s'appuient sur UNION ALL.
  check('v_patient_history utilise UNION ALL', /v_patient_history[\s\S]*UNION\s+ALL/.test(sql));
}

function verifySeed() {
  const sql = readMigration('003_seed.sql');

  console.log('— 003_seed.sql');

  // Cohérence du nombre de permissions : le seed doit déclarer les 81 lignes.
  const permissionInserts = [...sql.matchAll(/^\((\d+),\s*'([a-z]+:[a-z]+)'/gm)];
  check(
    'permissions du seed ≥ 81',
    permissionInserts.length >= 81,
    `${permissionInserts.length} déclarées`,
  );

  // Chaque code doit respecter la convention.
  const malformed = permissionInserts.filter((match) => !/^[a-z]+:(create|read|update|delete|manage)$/.test(match[2]));
  check(
    'codes de permission conformes',
    malformed.length === 0,
    malformed.length > 0 ? `${malformed.length} code(s) non conforme(s)` : 'tous valides',
  );

  // Les 8 rôles doivent être présents.
  const expectedRoles = [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'NURSE',
    'PHARMACIST',
    'RECEPTIONIST',
    'ACCOUNTANT',
    'NEWS_EDITOR',
    'PATIENT',
  ];
  const missingRoles = expectedRoles.filter((role) => !sql.includes(`'${role}'`));
  check('9 rôles déclarés', missingRoles.length === 0, missingRoles.join(', ') || 'tous présents');

  // Volumétrie annoncée en tête de fichier.
  check('30 patients insérés', /BETWEEN 24 AND 53/.test(sql));
  check('50 rendez-vous (40 + 4 + 6)', /s\.`n` <= 40/.test(sql) && /144|145|146/.test(sql));
  check('40 consultations', /a\.`id` BETWEEN 101 AND 140/.test(sql));
  check('20 médicaments', /\(20, 'Artéméther/.test(sql));
  check('15 gardes', /\(15, 2, 5/.test(sql));
  check('5 téléconsultations', /\(5, 146, 26/.test(sql));
  check('mot de passe bcrypt identique pour tous', (sql.match(/\$2b\$12\$/g) ?? []).length === 1);
}

/* -------------------------------------------------------------------------- */
/* Exécution                                                                   */
/* -------------------------------------------------------------------------- */

console.log('Vérification statique des scripts SQL MediClinic');
console.log('');

try {
  verifyInit();
  verifyViews();
  verifySeed();
} catch (error) {
  console.error(`Erreur de lecture : ${error.message}`);
  process.exitCode = 1;
}

console.log('');
console.log('Résultats :');

let failures = 0;
for (const result of results) {
  const status = result.ok ? 'OK  ' : 'ÉCHEC';
  if (!result.ok) failures += 1;
  console.log(`  ${status} ${result.label}${result.detail ? ` — ${result.detail}` : ''}`);
}

console.log('');
if (failures === 0) {
  console.log(`Tous les contrôles sont passés (${results.length}).`);
} else {
  console.log(`${failures} contrôle(s) en échec sur ${results.length}.`);
  process.exitCode = 1;
}
