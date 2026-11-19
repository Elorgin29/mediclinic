/**
 * Règles métier des paramètres de la clinique.
 *
 * Les paramètres sont lus en base et **complétés par les variables
 * d'environnement** : la clinique reste donc correctement identifiée sur ses
 * documents PDF même avant le premier enregistrement depuis l'interface.
 *
 * Sécurité : les secrets Zoom ne sont JAMAIS renvoyés au client. L'API expose
 * uniquement un booléen `zoomConfigured` et le libellé du mode actif, ce qui
 * suffit à l'interface pour afficher le bon bandeau d'information.
 */

import type { ClinicSettingsInput } from '@mediclinic/shared';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { isZoomConfigured, zoomModeLabel } from '../../config/zoom.js';
import * as repository from './settings.repository.js';

/** Paramètres exposés par `GET /api/settings`. */
export interface ClinicSettings {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  vat_rate: string;
  logo_url: string | null;
  zoomConfigured: boolean;
  zoomMode: string;
  updated_at: string | null;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Construit la vue publique des paramètres (sans aucun secret). */
export async function getSettings(): Promise<ClinicSettings> {
  const record = await repository.findSettings();
  const storedZoom = await repository.hasStoredZoomCredentials();

  return {
    // La base fait foi ; le .env sert de repli pour une installation neuve.
    name: record?.name ?? env.CLINIC_NAME,
    address: hasText(record?.address) ? record.address : env.CLINIC_ADDRESS,
    phone: hasText(record?.phone) ? record.phone : env.CLINIC_PHONE,
    email: hasText(record?.email) ? record.email : env.CLINIC_EMAIL,
    currency: record?.currency ?? env.CLINIC_CURRENCY,
    vat_rate: record?.vat_rate ?? env.CLINIC_VAT_RATE.toFixed(2),
    logo_url: record?.logo_url ?? null,
    // Zoom est « configuré » dès que l'un des deux jeux d'identifiants existe :
    // les variables d'environnement (prioritaires) ou la base.
    zoomConfigured: isZoomConfigured() || storedZoom,
    zoomMode: zoomModeLabel(),
    updated_at: record?.updated_at ?? null,
  };
}

/**
 * Met à jour les paramètres.
 *
 * @param input corps validé par `clinicSettingsSchema` (camelCase)
 */
export async function updateSettings(input: ClinicSettingsInput): Promise<ClinicSettings> {
  // Conversion camelCase (API) → snake_case (colonnes MySQL).
  const values: Partial<Record<repository.WritableColumn, unknown>> = {};

  if (input.name !== undefined) values.name = input.name;
  if (input.address !== undefined) values.address = input.address.trim() || null;
  if (input.phone !== undefined) values.phone = input.phone.trim() || null;
  if (input.email !== undefined) values.email = input.email.trim() || null;
  if (input.currency !== undefined) values.currency = input.currency.toUpperCase();
  if (input.vatRate !== undefined) values.vat_rate = input.vatRate;
  if (input.logoUrl !== undefined) values.logo_url = input.logoUrl.trim() || null;
  if (input.zoomAccountId !== undefined) values.zoom_account_id = input.zoomAccountId.trim() || null;
  if (input.zoomClientId !== undefined) values.zoom_client_id = input.zoomClientId.trim() || null;
  if (input.zoomClientSecret !== undefined) values.zoom_client_secret = input.zoomClientSecret.trim() || null;

  await repository.upsertSettings(values);

  // On relit systématiquement après écriture : c'est la seule façon de renvoyer
  // les valeurs par défaut appliquées par MySQL et l'horodatage `updated_at`.
  return getSettings();
}

/** Valeur de repli utilisée si un appelant attend un schéma plutôt qu'un objet. */
export const settingsSchema = z.object({}).passthrough();
