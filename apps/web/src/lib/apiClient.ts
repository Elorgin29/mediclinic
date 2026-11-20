/**
 * Client HTTP unique de l'application.
 *
 * Responsabilités :
 *  - ajouter automatiquement le jeton d'accès à chaque requête ;
 *  - rafraîchir la session **une seule fois** quand l'API répond 401, puis
 *    rejouer la requête initiale (le rafraîchissement est mutualisé : plusieurs
 *    requêtes simultanées ne déclenchent qu'un seul appel /auth/refresh) ;
 *  - normaliser les messages d'erreur pour l'interface.
 */

import type { ApiErrorBody, AuthSession } from '@mediclinic/shared';
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

/** URL de base de l'API (surchargée par VITE_API_URL). */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api';

const ACCESS_TOKEN_KEY = 'mediclinic.access_token';
const REFRESH_TOKEN_KEY = 'mediclinic.refresh_token';

/** Stockage des jetons. sessionStorage limite l'exposition en cas de XSS. */
export const tokenStorage = {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  save(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    // Le jeton de rafraîchissement est également conservé côté client : le
    // cookie httpOnly est la source principale, mais ce repli permet de
    // fonctionner lorsque les cookies tiers sont bloqués.
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

/** Callback appelé lorsque la session est définitivement perdue. */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

/* -------------------------------------------------------------------------- */
/* Intercepteur de requête : ajout du jeton d'accès                            */
/* -------------------------------------------------------------------------- */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  // La langue est lue directement dans le stockage pour éviter une dépendance
  // circulaire avec le provider React.
  try {
    const stored = localStorage.getItem('mediclinic.locale');
    if (stored === 'fr' || stored === 'en' || stored === 'mg') {
      config.headers.set('Accept-Language', stored);
    }
  } catch {
    // Stockage indisponible : l'API reste en français par défaut.
  }
  return config;
});

/* -------------------------------------------------------------------------- */
/* Intercepteur de réponse : rafraîchissement transparent                      */
/* -------------------------------------------------------------------------- */

/** Promesse de rafraîchissement partagée (évite les appels concurrents). */
let refreshPromise: Promise<AuthSession> | null = null;

/** Requêtes ne devant jamais déclencher de rafraîchissement. */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/register'];

function shouldSkipRefresh(url: string | undefined): boolean {
  if (!url) return true;
  return AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

async function refreshSession(): Promise<AuthSession> {
  const refreshToken = tokenStorage.getRefreshToken();

  const response = await axios.post<{ data: AuthSession }>(
    `${API_BASE_URL}/auth/refresh`,
    refreshToken ? { refreshToken } : {},
    { withCredentials: true, timeout: 15_000 },
  );

  const session = response.data.data;
  tokenStorage.save(session.tokens.accessToken, session.tokens.refreshToken);
  return session;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    const isUnauthorized = error.response?.status === 401;
    const isRefreshable =
      error.response?.data?.error?.code === 'TOKEN_EXPIRED' ||
      error.response?.data?.error?.code === 'TOKEN_INVALID' ||
      error.response?.data?.error?.code === 'TOKEN_MISSING';

    if (isUnauthorized && original && !original._retried && !shouldSkipRefresh(original.url) && isRefreshable) {
      original._retried = true;
      try {
        refreshPromise = refreshPromise ?? refreshSession();
        const session = await refreshPromise;
        refreshPromise = null;

        original.headers.set('Authorization', `Bearer ${session.tokens.accessToken}`);
        return await api.request(original);
      } catch (refreshError) {
        refreshPromise = null;
        tokenStorage.clear();
        onSessionExpired?.();
        return await Promise.reject(refreshError);
      }
    }

    if (isUnauthorized && !shouldSkipRefresh(original?.url)) {
      tokenStorage.clear();
      onSessionExpired?.();
    }

    return await Promise.reject(error);
  },
);

/* -------------------------------------------------------------------------- */
/* Normalisation des erreurs                                                   */
/* -------------------------------------------------------------------------- */

/** Message lisible à afficher pour n'importe quelle erreur Axios. */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    if (body?.error?.message) return body.error.message;

    if (error.code === 'ECONNABORTED') {
      return 'Le serveur met trop de temps à répondre. Vérifiez que l’API est démarrée.';
    }
    if (!error.response) {
      return 'Impossible de joindre le serveur. Vérifiez que l’API est démarrée sur le port 4000.';
    }
    return `Erreur ${error.response.status}.`;
  }

  if (error instanceof Error) return error.message;
  return 'Une erreur inattendue est survenue.';
}

export interface FieldError {
  path: string;
  message: string;
}

/** Erreurs de validation Zod renvoyées par l'API (422/400). */
export function getFieldErrors(error: unknown): FieldError[] {
  if (!axios.isAxiosError(error)) return [];
  const details = (error.response?.data as ApiErrorBody | undefined)?.error?.details;
  if (!Array.isArray(details)) return [];

  return details
    .filter((item): item is FieldError => typeof item === 'object' && item !== null && 'message' in item)
    .map((item) => ({ path: String(item.path ?? ''), message: String(item.message) }));
}

/** Code fonctionnel renvoyé par l'API (`NOT_FOUND`, `DUPLICATE_ENTRY`…). */
export function getApiErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  return (error.response?.data as ApiErrorBody | undefined)?.error?.code ?? null;
}

/* -------------------------------------------------------------------------- */
/* Aides typées                                                                */
/* -------------------------------------------------------------------------- */

/** GET renvoyant `{ data: T }`. */
export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.get<{ data: T }>(url, config);
  return response.data.data;
}

/** GET renvoyant directement `T` (listes paginées : `{ data, meta }`). */
export async function apiGetRaw<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.get<T>(url, config);
  return response.data;
}

/** POST renvoyant `{ data: T }`. */
export async function apiPost<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.post<{ data: T }>(url, body, config);
  return response.data.data;
}

/** PATCH renvoyant `{ data: T }`. */
export async function apiPatch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.patch<{ data: T }>(url, body, config);
  return response.data.data;
}

/** PUT renvoyant `{ data: T }`. */
export async function apiPut<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.put<{ data: T }>(url, body, config);
  return response.data.data;
}

/** DELETE sans contenu. */
export async function apiDelete(url: string, config?: AxiosRequestConfig): Promise<void> {
  await api.delete(url, config);
}
