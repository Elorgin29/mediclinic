/**
 * Aides transverses de l'interface : fusion de classes CSS, construction de
 * query strings et correspondance des statuts vers des couleurs de badge.
 */

import type {
  AppointmentStatus,
  InvoiceStatus,
  MeetingStatus,
  PrescriptionStatus,
  ShiftStatus,
} from '@mediclinic/shared';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Fusionne des classes Tailwind en résolvant les conflits. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Série de tons supportés par les badges. */
export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

/**
 * Construit une query string en ignorant les valeurs vides.
 * `{ page: 1, search: '' }` → `?page=1`
 */
export function buildQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== '') search.append(key, String(item));
      }
      continue;
    }
    search.append(key, String(value));
  }

  const query = search.toString();
  return query.length > 0 ? `?${query}` : '';
}

/** Virgule française pour les grands nombres. */
export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Tronque un texte trop long pour l'aperçu d'un tableau. */
export function truncate(value: string | null | undefined, max = 60): string {
  if (!value) return '—';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/* -------------------------------------------------------------------------- */
/* Correspondance statut → tonalité                                            */
/* -------------------------------------------------------------------------- */

const APPOINTMENT_TONES: Record<AppointmentStatus, Tone> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  CHECKED_IN: 'brand',
  IN_PROGRESS: 'brand',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  NO_SHOW: 'neutral',
};

const INVOICE_TONES: Record<InvoiceStatus, Tone> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CANCELLED: 'danger',
};

const MEETING_TONES: Record<MeetingStatus, Tone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  COMPLETED: 'info',
  CANCELLED: 'neutral',
};

const PRESCRIPTION_TONES: Record<PrescriptionStatus, Tone> = {
  ISSUED: 'info',
  DISPENSED: 'success',
  CANCELLED: 'danger',
};

const SHIFT_TONES: Record<ShiftStatus, Tone> = {
  SCHEDULED: 'warning',
  CONFIRMED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

export const statusTone = {
  appointment: (status: AppointmentStatus): Tone => APPOINTMENT_TONES[status] ?? 'neutral',
  invoice: (status: InvoiceStatus): Tone => INVOICE_TONES[status] ?? 'neutral',
  meeting: (status: MeetingStatus): Tone => MEETING_TONES[status] ?? 'neutral',
  prescription: (status: PrescriptionStatus): Tone => PRESCRIPTION_TONES[status] ?? 'neutral',
  shift: (status: ShiftStatus): Tone => SHIFT_TONES[status] ?? 'neutral',
  /** Ton générique fondé sur le mot-clé, pour les statuts libres (laboratoire). */
  generic: (status: string): Tone => {
    switch (status) {
      case 'PENDING':
        return 'warning';
      case 'IN_PROGRESS':
        return 'info';
      case 'COMPLETED':
      case 'PAID':
      case 'APPROVED':
        return 'success';
      case 'CANCELLED':
      case 'REJECTED':
      case 'NO_SHOW':
        return 'danger';
      default:
        return 'neutral';
    }
  },
};

/** Palette stable utilisée pour colorer les médecins dans le planning. */
export const DOCTOR_COLORS = [
  '#0f766e',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#ca8a04',
  '#0891b2',
  '#4d7c0f',
  '#9333ea',
  '#b91c1c',
] as const;

/** Couleur associée à un médecin (stable pour un même identifiant). */
export function doctorColor(doctorId: number): string {
  return DOCTOR_COLORS[doctorId % DOCTOR_COLORS.length] ?? DOCTOR_COLORS[0];
}

/** Initiales de secours pour les avatars. */
export function initialsFrom(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/** Gestion du thème sombre (bonus). */
export const themeStorage = {
  key: 'mediclinic.theme',
  get(): 'light' | 'dark' {
    const stored = localStorage.getItem(this.key);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },
  apply(theme: 'light' | 'dark'): void {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(this.key, theme);
  },
};
