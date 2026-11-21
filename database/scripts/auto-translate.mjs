#!/usr/bin/env node
/**
 * Traduction automatique (API gratuite) des textes de l'interface et des données.
 *
 * Sources :
 *  - chaînes françaises présentes dans `apps/web/src` (interface) ;
 *  - colonnes textuelles de la base (spécialités, départements, rôles,
 *    permissions, notifications, actualités, identité de la clinique).
 *
 * Fournisseur : Google Translate (endpoint public `client=gtx`, sans clé),
 * avec repli MyMemory si la réponse est invalide. Résultats mis en cache dans
 * `.translation-cache.json` puis écrits dans la table `translations` et dans
 * la migration `006_auto_translations.sql` (idempotente, utilisable sans réseau).
 *
 * Usage : node database/scripts/auto-translate.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const cachePath = path.join(here, '.translation-cache.json');
const sourceRoot = path.join(root, 'apps', 'web', 'src');

/* -------------------------------------------------------------------------- */
/* Extraction des chaînes de l'interface                                       */
/* -------------------------------------------------------------------------- */

function collectSourceFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, files);
    else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(full);
  }
  return files;
}

/** Vraies phrases françaises : on exclut le code, les chemins et les commentaires longs. */
/** Clé lisible pour les textes courts, empreinte djb2 pour les longs. */
function translationKey(source) {
  const trimmed = source.trim();
  if (trimmed.length <= 150) return `text:${trimmed}`;
  let hash = 5381;
  for (let index = 0; index < trimmed.length; index += 1) {
    hash = ((hash << 5) + hash + trimmed.charCodeAt(index)) >>> 0;
  }
  return `text:h:${hash.toString(16)}:${trimmed.length}`;
}

function looksLikeText(value) {
  if (value.length < 3 || value.length > 260) return false;
  if (/[\n\r{}<>\\]|=>|\/\/|\$\{|\b(?:const|return|import|export|function|expect|test)\b/.test(value)) return false;
  if (!/[À-ÿ]/.test(value)) return false;
  const letters = (value.match(/[\p{L}]/gu) ?? []).length;
  return letters / value.length > 0.55;
}

function extractUiStrings() {
  const found = new Set();
  for (const file of collectSourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    // Texte JSX entre balises.
    for (const match of source.matchAll(/>([^<>{}]{2,260})</g)) {
      const value = match[1].trim();
      if (looksLikeText(value)) found.add(value);
    }
    // Chaînes littérales (les traductions de l'interface sont des string literals).
    for (const match of source.matchAll(/(['"`])([^'"`\n]{2,260})\1/g)) {
      const value = match[2].trim();
      if (looksLikeText(value)) found.add(value);
    }
    // 3. Attributs JSX (`label="..."`, `title="..."`) : les apostrophes
    //    droites à l'intérieur sont autorisées par les guillemets doubles.
    for (const match of source.matchAll(/=\s*"([^"\n]{2,260})"/g)) {
      const value = match[1].trim();
      if (looksLikeText(value)) found.add(value);
    }
    for (const match of source.matchAll(/=\s*'([^'\n]{2,260})'/g)) {
      const value = match[1].trim();
      if (looksLikeText(value)) found.add(value);
    }
    // 4. Variantes en majuscules (statistiques, en-têtes de tableaux).
    for (const value of [...found]) {
      const upper = value.toUpperCase();
      if (looksLikeText(upper)) found.add(upper);
    }
  }
  return [...found];
}

/* -------------------------------------------------------------------------- */
/* Appels aux API gratuites                                                    */
/* -------------------------------------------------------------------------- */

async function translateGoogle(text, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=' +
    target +
    '&dt=t&q=' +
    encodeURIComponent(text);
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Google ${response.status}`);
  const body = await response.json();
  const result = body?.[0]?.map((part) => part[0]).join('') ?? '';
  if (!result.trim()) throw new Error('Google: réponse vide');
  return result;
}

async function translateMyMemory(text, target) {
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) +
    `&langpair=fr|${target}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`MyMemory ${response.status}`);
  const body = await response.json();
  const result = body?.responseData?.translatedText ?? '';
  if (!result.trim() || /MYMEMORY WARNING/i.test(result)) throw new Error('MyMemory: réponse vide');
  return result;
}

async function translate(text, target) {
  try {
    return await translateGoogle(text, target);
  } catch {
    try {
      return await translateMyMemory(text, target);
    } catch {
      return null;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Données de la base                                                          */
/* -------------------------------------------------------------------------- */

async function collectDatabaseTexts(connection) {
  const entries = [];
  const add = (key, value) => {
    if (typeof value === 'string' && value.trim().length > 1) entries.push({ key, value: value.trim() });
  };

  const [roles] = await connection.query('SELECT id, code, name, description FROM roles');
  for (const row of roles) {
    add(`role.${row.code}.name`, row.name);
    add(`role.${row.code}.description`, row.description);
  }

  const [permissions] = await connection.query('SELECT code, description FROM permissions');
  for (const row of permissions) add(`permission.${row.code}.description`, row.description);

  const [specialties] = await connection.query('SELECT id, name, description FROM specialties');
  for (const row of specialties) {
    add(`specialty.${row.id}.name`, row.name);
    add(`specialty.${row.id}.description`, row.description);
  }

  const [departments] = await connection.query('SELECT id, name, description FROM departments');
  for (const row of departments) {
    add(`department.${row.id}.name`, row.name);
    add(`department.${row.id}.description`, row.description);
  }

  const [news] = await connection.query('SELECT slug, title, category, excerpt, content, key_points, author FROM news');
  for (const row of news) {
    add(`news.${row.slug}.title`, row.title);
    add(`news.${row.slug}.excerpt`, row.excerpt);
    add(`news.${row.slug}.category`, row.category);
    add(`news.${row.slug}.author`, row.author);
    try {
      for (const [index, paragraph] of JSON.parse(row.content).entries()) {
        add(`news.${row.slug}.content.${index}`, paragraph);
      }
      for (const [index, point] of JSON.parse(row.key_points ?? '[]').entries()) {
        add(`news.${row.slug}.key_points.${index}`, point);
      }
    } catch {
      // Contenu non JSON : ignoré.
    }
  }

  const [settings] = await connection.query('SELECT name, address FROM clinic_settings LIMIT 1');
  if (settings[0]) {
    add('clinic.name', settings[0].name);
    add('clinic.address', settings[0].address);
  }

  const [notifications] = await connection.query(
    'SELECT title, message FROM notifications GROUP BY title, message ORDER BY MIN(id) LIMIT 20',
  );
  for (const row of notifications) {
    add(`notification.text:${row.title}`, row.title);
    add(`notification.text:${row.message}`, row.message);
  }

  return entries;
}

/* -------------------------------------------------------------------------- */
/* Programme principal                                                         */
/* -------------------------------------------------------------------------- */

async function main() {
  const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
  const uiStrings = extractUiStrings();
  console.log(`Chaînes UI détectées : ${uiStrings.length}`);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'mediclinic',
    password: process.env.DB_PASSWORD ?? 'mediclinic',
    database: process.env.DB_NAME ?? 'mediclinic',
  });
  const dbEntries = await collectDatabaseTexts(connection);
  console.log(`Textes base détectés : ${dbEntries.length}`);

  const jobs = [];
  for (const value of uiStrings) jobs.push({ key: translationKey(value), value });
  for (const entry of dbEntries) jobs.push(entry);

  const targets = ['en', 'mg'];
  const rows = [];
  let translated = 0;

  //-filetype de traduction : clé "langue|texte" mise en cache.
  const translateText = async (value, target) => {
    const cacheKey = `${target}|${value}`;
    if (cache[cacheKey] !== undefined) return cache[cacheKey];
    const result = await translate(value, target);
    cache[cacheKey] = result;
    return result;
  };

  const queue = [];
  for (const job of jobs) {
    for (const target of targets) queue.push({ job, target });
  }

  // Petit pool pour ne pas saturer les API gratuites.
  const workers = Array.from({ length: 10 }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const value = await translateText(item.job.value, item.target);
      if (value) {
        rows.push([item.target, item.job.key, value]);
        translated += 1;
      }
      if (translated % 100 === 0) {
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
        console.log(`  ${translated} traductions (${queue.length} restantes)`);
      }
    }
  });
  await Promise.all(workers);

  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));

  for (const [locale, key, value] of rows) {
    await connection.query(
      'INSERT INTO translations (`locale`, `key`, `value`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
      [locale, key, value],
    );
  }

  const [counts] = await connection.query('SELECT locale, COUNT(*) AS total FROM translations GROUP BY locale');
  console.log('Traductions générées :', translated);
  console.log('Contenu de la table translations :', counts);

  // Migration auto-contained pour les installations sans accès réseau.
  const sqlPath = path.join(root, 'database', 'migrations', '006_auto_translations.sql');
  const escape = (v) => String(v).replace(/'/g, "''");
  const lines = [
    '-- Traductions générées automatiquement via API gratuite (Google / MyMemory).',
    '-- Régénérer avec : node database/scripts/auto-translate.mjs',
    '',
    'INSERT INTO `translations` (`locale`, `key`, `value`) VALUES',
    rows
      .map(([locale, key, value]) => `('${locale}', '${escape(key)}', '${escape(value)}')`)
      .join(',\n') + ';',
    '',
  ];
  fs.writeFileSync(sqlPath, lines.join('\n'));
  console.log(`Migration écrite : ${path.relative(root, sqlPath)}`);

  await connection.end();
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});
