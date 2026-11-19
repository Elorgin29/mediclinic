/**
 * Accès aux données des paramètres de la clinique.
 *
 * La table `clinic_settings` est un singleton : la contrainte CHECK de
 * `001_init.sql` impose `id = 1`. Les écritures passent donc systématiquement
 * par `INSERT … ON DUPLICATE KEY UPDATE` sur cette clé, ce qui rend l'API
 * idempotente (un premier PATCH crée la ligne, les suivants la mettent à jour).
 */

import type { Row } from '../../config/db.js';
import { execute, queryOne } from '../../config/db.js';

/** Ligne unique de `clinic_settings`. */
export interface ClinicSettingsRecord extends Row {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  vat_rate: string;
  logo_url: string | null;
  zoom_account_id: string | null;
  zoom_client_id: string | null;
  zoom_client_secret: string | null;
  updated_at: string;
}

/** Identifiant imposé par la contrainte de singleton. */
const SETTINGS_ID = 1;

/** Colonnes lisibles (aucune n'est sensible : les secrets ne sortent pas d'ici). */
const SETTINGS_COLUMNS = `
  id, name, address, phone, email, currency, vat_rate, logo_url,
  zoom_account_id, zoom_client_id, zoom_client_secret, updated_at
`;

/** Lit la ligne de paramètres, ou `null` si la table n'a pas encore été alimentée. */
export async function findSettings(): Promise<ClinicSettingsRecord | null> {
  return queryOne<ClinicSettingsRecord>(
    `SELECT ${SETTINGS_COLUMNS} FROM clinic_settings WHERE id = ?`,
    [SETTINGS_ID],
  );
}

/**
 * Champs autorisés à l'écriture.
 * Liste blanche stricte : le client ne peut pas écrire `id` ni `updated_at`
 * (ce dernier est maintenu par `ON UPDATE CURRENT_TIMESTAMP`).
 */
const WRITABLE_COLUMNS = [
  'name',
  'address',
  'phone',
  'email',
  'currency',
  'vat_rate',
  'logo_url',
  'zoom_account_id',
  'zoom_client_id',
  'zoom_client_secret',
] as const;

export type WritableColumn = (typeof WRITABLE_COLUMNS)[number];

/**
 * Crée ou met à jour les paramètres de la clinique.
 * Seules les colonnes présentes dans `values` sont écrites : un PATCH partiel
 * ne réinitialise donc pas les champs non transmis.
 */
export async function upsertSettings(values: Partial<Record<WritableColumn, unknown>>): Promise<void> {
  const columns = WRITABLE_COLUMNS.filter((column) =>
    Object.prototype.hasOwnProperty.call(values, column),
  );

  if (columns.length === 0) {
    // Rien à écrire : on s'assure simplement que la ligne singleton existe.
    await execute(
      'INSERT IGNORE INTO clinic_settings (id) VALUES (?)',
      [SETTINGS_ID],
    );
    return;
  }

  const placeholders = columns.map(() => '?').join(', ');
  const assignments = columns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
  const params = columns.map((column) => values[column]);

  await execute(
    `INSERT INTO clinic_settings (id, ${columns.map((column) => `\`${column}\``).join(', ')})
     VALUES (?, ${placeholders})
     ON DUPLICATE KEY UPDATE ${assignments}`,
    [SETTINGS_ID, ...params],
  );
}

/** Vrai si des identifiants Zoom sont enregistrés en base. */
export async function hasStoredZoomCredentials(): Promise<boolean> {
  const row = await queryOne<Row & { configured: number }>(
    `SELECT
       (zoom_account_id IS NOT NULL AND zoom_account_id <> ''
        AND zoom_client_id IS NOT NULL AND zoom_client_id <> ''
        AND zoom_client_secret IS NOT NULL AND zoom_client_secret <> '') AS configured
     FROM clinic_settings WHERE id = ?`,
    [SETTINGS_ID],
  );
  return Boolean(row?.configured);
}
