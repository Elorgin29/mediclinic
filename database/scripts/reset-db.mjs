#!/usr/bin/env node
/**
 * Initialisation de la base de données MediClinic.
 *
 * Ce script remplace le `bash database/scripts/reset-db.sh` d'origine : il
 * fonctionne de façon identique sous Windows, macOS et Linux, sans dépendre
 * d'un shell particulier.
 *
 * Il exécute, dans l'ordre :
 *   1. `001_init.sql`   — création de la base, des tables et des triggers ;
 *   2. `002_views.sql`  — création des vues ;
 *   3. `003_seed.sql`   — jeu de données de démonstration (optionnel) ;
 *   4. `004_news.sql`   — module Actualités + rôle Rédacteur (idempotent).
 *
 * UTILISATION
 *   node database/scripts/reset-db.mjs            # structure + vues seulement
 *   node database/scripts/reset-db.mjs --seed     # avec les données de démo
 *   node database/scripts/reset-db.mjs --seed --yes
 *
 * VARIABLES LUES (fichier .env à la racine, ou variables d'environnement)
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *   MYSQL_ROOT_PASSWORD  (utilisé si DB_USER est vide)
 *
 * ATTENTION : `001_init.sql` contient des `DROP TABLE`. Le script demande donc
 * une confirmation explicite avant de détruire une base existante, sauf avec
 * `--yes`.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import mysql from 'mysql2/promise';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..', '..');
const migrationsDir = path.join(repoRoot, 'database', 'migrations');

/* -------------------------------------------------------------------------- */
/* Lecture minimaliste du fichier .env                                         */
/* -------------------------------------------------------------------------- */

/** Charge `.env` sans dépendance externe (le script doit tourner seul). */
function loadDotEnv() {
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    // Retire les guillemets englobants éventuels.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/* -------------------------------------------------------------------------- */
/* Exécution d'un script SQL                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Découpe un fichier SQL en instructions.
 *
 * Le point délicat est le mot-clé `DELIMITER` utilisé par les triggers :
 * le client MySQL en ligne de commande le gère, mais l'API mysql2 non. On
 * commence donc par neutraliser les blocs `DELIMITER $$ … DELIMITER ;` en
 * retirant les lignes de directive, puis on découpe sur `;` en fin de ligne.
 */
function splitStatements(sql) {
  // Gère les directives DELIMITER (utilisées par les triggers) : on suit le
  // délimiteur courant et on découpe uniquement sur celui-ci.
  const lines = sql.split(/\r?\n/);
  let delimiter = ';';
  let current = [];
  const statements = [];

  const flush = () => {
    const buf = current.join('\n').trim();
    current = [];
    if (buf.length === 0) return;
    let stmt = buf;
    if (stmt.endsWith(delimiter)) {
      stmt = stmt.slice(0, -delimiter.length).trim();
    }
    if (stmt.length === 0) return;
    statements.push(stmt);
  };

  for (const line of lines) {
    const match = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (match) {
      flush();
      delimiter = match[1];
      continue;
    }
    current.push(line);
    const buf = current.join('\n').trimEnd();
    if (buf.endsWith(delimiter)) {
      flush();
    }
  }
  flush();

  return statements.filter((statement) => {
    const withoutComments = statement
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    return withoutComments.length > 0;
  });
}

/** Exécute un fichier SQL sur une connexion donnée. */
async function runSqlFile(connection, filename) {
  const filePath = path.join(migrationsDir, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier introuvable : ${filePath}`);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = splitStatements(sql);

  process.stdout.write(`  → ${filename} (${statements.length} instruction(s)) `);

  for (const statement of statements) {
    try {
      await connection.query(statement);
    } catch (error) {
      // `DROP TRIGGER IF EXISTS` et `DROP VIEW IF EXISTS` peuvent échouer sur
      // une base vierge : ces cas sont bénins.
      const ignorable =
        error.code === 'ER_SP_DOES_NOT_EXIST' ||
        error.code === 'ER_BAD_FIELD_ERROR' ||
        /^DROP (TRIGGER|VIEW|TABLE)/i.test(statement);

      if (!ignorable) {
        process.stdout.write('\n');
        throw new Error(`${filename} : ${error.message}\n--- Instruction ---\n${statement.slice(0, 500)}`);
      }
    }
  }

  process.stdout.write('OK\n');
}

/* -------------------------------------------------------------------------- */
/* Programme principal                                                         */
/* -------------------------------------------------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const withSeed = args.includes('--seed');
  const skipConfirm = args.includes('--yes');

  loadDotEnv();

  const host = process.env.DB_HOST ?? '127.0.0.1';
  const port = Number.parseInt(process.env.DB_PORT ?? '3306', 10);
  const database = process.env.DB_NAME ?? 'mediclinic';
  const user = process.env.DB_USER ?? 'root';
  const password = process.env.DB_PASSWORD ?? process.env.MYSQL_ROOT_PASSWORD ?? '';

  console.log('MediClinic — initialisation de la base de données');
  console.log(`  Serveur   : ${host}:${port}`);
  console.log(`  Base      : ${database}`);
  console.log(`  Utilisateur : ${user}`);
  console.log(`  Données de démonstration : ${withSeed ? 'oui' : 'non'}`);
  console.log('');

  if (!skipConfirm) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `Cette opération SUPPRIME les tables existantes de « ${database} ». Continuer ? (oui/non) `,
    );
    rl.close();

    if (!['oui', 'o', 'yes', 'y'].includes(answer.trim().toLowerCase())) {
      console.log('Opération annulée.');
      return;
    }
  }

  let connection;

  try {
    // 1. Connexion sans base pour pouvoir la créer.
    connection = await mysql.createConnection({ host, port, user, password, multipleStatements: false });
    console.log('Connexion au serveur MySQL établie.');

    // 2. Création de la base si nécessaire (001_init.sql la crée aussi, mais
    //    `USE` échouerait si elle n'existait pas encore).
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\`
       DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`,
    );
    await connection.query(`USE \`${database}\``);
    console.log(`Base « ${database} » prête.\n`);

    // 3. Exécution des scripts.
    console.log('Exécution des scripts SQL :');
    await runSqlFile(connection, '001_init.sql');
    await runSqlFile(connection, '002_views.sql');

    if (withSeed) {
      await runSqlFile(connection, '003_seed.sql');
    }

    // 004 est idempotent : il met aussi à niveau une base déjà existante.
    await runSqlFile(connection, '004_news.sql');

    // 4. Vérification.
    const [tables] = await connection.query(
      `SELECT COUNT(*) AS total FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
      [database],
    );
    const [views] = await connection.query(
      `SELECT COUNT(*) AS total FROM information_schema.views WHERE table_schema = ?`,
      [database],
    );

    console.log('');
    console.log(`Terminé : ${tables[0]?.total ?? 0} table(s), ${views[0]?.total ?? 0} vue(s).`);

    if (!withSeed) {
      console.log('');
      console.log('Pour ajouter le jeu de démonstration :');
      console.log('  node database/scripts/reset-db.mjs --seed --yes');
    } else {
      console.log('');
      console.log('Comptes de démonstration (mot de passe : Passw0rd!2026) :');
      console.log('  superadmin@mediclinic.fr   (SUPER_ADMIN)');
      console.log('  admin@mediclinic.fr        (ADMIN)');
      console.log('  amine.haddad@mediclinic.fr (DOCTOR)');
      console.log('  paul.mercier@mediclinic.fr (PHARMACIST)');
      console.log('  emma.gautier@mediclinic.fr (RECEPTIONIST)');
      console.log('  hugo.charpentier@mediclinic.fr (ACCOUNTANT)');
      console.log('  redaction@mediclinic.fr    (NEWS_EDITOR)');
      console.log('  lucie.durand@email.fr      (PATIENT)');
    }
  } catch (error) {
    console.error('');
    console.error('ÉCHEC :', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.error('');
      console.error('Le serveur MySQL ne répond pas. Vérifiez :');
      console.error('  - que MySQL est démarré (service local ou conteneur Docker) ;');
      console.error('  - les paramètres DB_HOST / DB_PORT de votre fichier .env ;');
      console.error('  - avec Docker : « docker compose up -d mysql ».');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('');
      console.error('Identifiants refusés. Vérifiez DB_USER et DB_PASSWORD dans .env.');
    }

    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

await main();
