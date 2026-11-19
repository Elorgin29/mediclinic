/** Formateurs et helpers partagés (dates, monnaie, libellés). */

import {
  APPOINTMENT_STATUS_LABELS_FR,
  APPOINTMENT_TYPE_LABELS_FR,
  INVOICE_STATUS_LABELS_FR,
  MEETING_STATUS_LABELS_FR,
  PAYMENT_METHOD_LABELS_FR,
  PRESCRIPTION_STATUS_LABELS_FR,
  ROLE_LABELS_FR,
  SHIFT_STATUS_LABELS_FR,
  SHIFT_TYPE_LABELS_FR,
  type RoleCode,
} from './constants';

const DATE_FR = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATE_LONG_FR = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const DATETIME_FR = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const TIME_FR = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value?: string | Date | null): string {
  const d = toDate(value);
  return d ? DATE_FR.format(d) : '—';
}

export function formatDateLong(value?: string | Date | null): string {
  const d = toDate(value);
  return d ? DATE_LONG_FR.format(d) : '—';
}

export function formatDateTime(value?: string | Date | null): string {
  const d = toDate(value);
  return d ? DATETIME_FR.format(d) : '—';
}

export function formatTime(value?: string | Date | null): string {
  const d = toDate(value);
  return d ? TIME_FR.format(d) : '—';
}

export function formatMoney(value: number | string | null | undefined, currency = 'EUR'): string {
  // Une valeur absente n'est pas un montant nul : afficher « 0,00 € » laisserait
  // croire à une facture gratuite. On utilise donc un tiret explicite.
  if (value === null || value === undefined || value === '') return '—';

  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return '—';

  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)} %`;
}

export function formatAge(birthDate?: string | null): string {
  const d = toDate(birthDate);
  if (!d) return '—';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return `${age} ans`;
}

/** Convertit une Date en valeur acceptée par un <input type="datetime-local">. */
export function toDateTimeLocal(value: string | Date): string {
  const d = toDate(value);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export function toDateInput(value: string | Date): string {
  const d = toDate(value);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const labels = {
  appointmentStatus: APPOINTMENT_STATUS_LABELS_FR,
  appointmentType: APPOINTMENT_TYPE_LABELS_FR,
  invoiceStatus: INVOICE_STATUS_LABELS_FR,
  paymentMethod: PAYMENT_METHOD_LABELS_FR,
  prescriptionStatus: PRESCRIPTION_STATUS_LABELS_FR,
  shiftStatus: SHIFT_STATUS_LABELS_FR,
  shiftType: SHIFT_TYPE_LABELS_FR,
  meetingStatus: MEETING_STATUS_LABELS_FR,
  role: ROLE_LABELS_FR,
};

export function roleLabel(code: string): string {
  return ROLE_LABELS_FR[code as RoleCode] ?? code;
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

export function buildQueryString(params: Record<string, unknown>): string {
  const entries: string[] = [];
  const encode = (value: string) =>
    encodeURIComponent(value)
      .replace(/[!'()~]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
      .replace(/%20/g, '+');

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    entries.push(`${encode(key)}=${encode(String(value))}`);
  }
  const qs = entries.join('&');
  return qs ? `?${qs}` : '';
}
