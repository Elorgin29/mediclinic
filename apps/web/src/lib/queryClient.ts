/**
 * Configuration TanStack Query.
 *
 * Les données médicales évoluent vite côté secrétariat : les listes restent
 * « fraîches » 30 secondes, ce qui évite de recharger à chaque navigation tout
 * en restant à jour. Aucune nouvelle tentative n'est faite sur les erreurs 4xx
 * (inutile) ; les erreurs réseau sont retentées deux fois.
 */

import { QueryClient } from '@tanstack/react-query';
import axios from 'axios';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          // 401 (session), 403, 404, 422 : inutile de réessayer.
          if (status !== undefined && status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

/** Clés de cache centralisées : évite les fautes de frappe et les collisions. */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
    charts: ['dashboard', 'charts'] as const,
    activity: ['dashboard', 'activity'] as const,
  },
  patients: {
    all: (filters: unknown) => ['patients', filters] as const,
    detail: (id: number) => ['patients', id] as const,
    history: (id: number) => ['patients', id, 'history'] as const,
    appointments: (id: number) => ['patients', id, 'appointments'] as const,
    me: ['patients', 'me'] as const,
  },
  doctors: {
    all: (filters: unknown) => ['doctors', filters] as const,
    detail: (id: number) => ['doctors', id] as const,
    public: (filters: unknown) => ['doctors', 'public', filters] as const,
    availability: (id: number, date: string) => ['doctors', id, 'availability', date] as const,
  },
  appointments: {
    all: (filters: unknown) => ['appointments', filters] as const,
    detail: (id: number) => ['appointments', id] as const,
    today: ['appointments', 'today'] as const,
    calendar: (from: string, to: string) => ['appointments', 'calendar', from, to] as const,
    me: ['appointments', 'me'] as const,
  },
  consultations: {
    all: (filters: unknown) => ['consultations', filters] as const,
    detail: (id: number) => ['consultations', id] as const,
  },
  prescriptions: {
    all: (filters: unknown) => ['prescriptions', filters] as const,
    detail: (id: number) => ['prescriptions', id] as const,
  },
  medications: {
    all: (filters: unknown) => ['medications', filters] as const,
    detail: (id: number) => ['medications', id] as const,
    lowStock: ['medications', 'low-stock'] as const,
    categories: ['medications', 'categories'] as const,
  },
  stock: {
    movements: (filters: unknown) => ['stock', 'movements', filters] as const,
    alerts: ['stock', 'alerts'] as const,
    summary: ['stock', 'summary'] as const,
  },
  invoices: {
    all: (filters: unknown) => ['invoices', filters] as const,
    detail: (id: number) => ['invoices', id] as const,
    stats: ['invoices', 'stats'] as const,
    me: ['invoices', 'me'] as const,
  },
  payments: {
    all: (filters: unknown) => ['payments', filters] as const,
  },
  shifts: {
    all: (filters: unknown) => ['shifts', filters] as const,
    calendar: (from: string, to: string) => ['shifts', 'calendar', from, to] as const,
  },
  meetings: {
    all: (filters: unknown) => ['meetings', filters] as const,
    detail: (id: number) => ['meetings', id] as const,
    me: ['meetings', 'me'] as const,
  },
  notifications: {
    all: (filters: unknown) => ['notifications', filters] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
  },
  audit: {
    all: (filters: unknown) => ['audit', filters] as const,
    stats: ['audit', 'stats'] as const,
  },
  reports: {
    revenue: (from: string, to: string) => ['reports', 'revenue', from, to] as const,
    appointments: (from: string, to: string, groupBy: string) =>
      ['reports', 'appointments', from, to, groupBy] as const,
    stock: (from: string, to: string) => ['reports', 'stock', from, to] as const,
    activity: (from: string, to: string) => ['reports', 'activity', from, to] as const,
    patients: (from: string, to: string) => ['reports', 'patients', from, to] as const,
  },
  users: { all: (filters: unknown) => ['users', filters] as const, detail: (id: number) => ['users', id] as const },
  roles: { all: ['roles'] as const, detail: (id: number) => ['roles', id] as const, matrix: ['roles', 'matrix'] as const },
  permissions: { all: ['permissions'] as const, grouped: ['permissions', 'grouped'] as const },
  settings: ['settings'] as const,
  lab: {
    tests: ['lab', 'tests'] as const,
    requests: (filters: unknown) => ['lab', 'requests', filters] as const,
  },
  specialties: { all: ['specialties'] as const, detail: (id: number) => ['specialties', id] as const },
  departments: { all: ['departments'] as const, detail: (id: number) => ['departments', id] as const },
};
