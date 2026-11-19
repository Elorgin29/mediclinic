/**
 * Contexte d'authentification.
 *
 * La session est restaurée au chargement à partir du jeton conservé côté
 * client : `GET /api/auth/me` renvoie le profil à jour (rôles et permissions
 * effectifs), ce qui garantit que l'interface reflète toujours les droits
 * réels, même après une modification faite par un administrateur.
 */

import type { AuthSession, RegisterPatientInput, User } from '@mediclinic/shared';
import { STAFF_ROLES, hasAnyPermission, hasPermission } from '@mediclinic/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { apiGet, apiPost, setSessionExpiredHandler, tokenStorage } from '@/lib/apiClient';

interface AuthContextValue {
  /** Utilisateur connecté, ou `null` pour un visiteur. */
  user: User | null;
  /** true tant que la session initiale n'est pas résolue. */
  isLoading: boolean;
  isAuthenticated: boolean;
  /** true si l'utilisateur appartient au personnel (hors patient). */
  isStaff: boolean;
  /** true si l'utilisateur a le rôle PATIENT. */
  isPatient: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterPatientInput) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** Déconnecte localement l'utilisateur (sans appel réseau). */
  const clearSession = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  /** Restaure la session au démarrage. */
  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      const token = tokenStorage.getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const profile = await apiGet<User>('/auth/me');
        if (!cancelled) setUser(profile);
      } catch {
        // Jeton expiré ou révoqué : la session est simplement considérée absente.
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  /** Réagit à une session définitivement perdue (rafraîchissement impossible). */
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const applySession = useCallback((session: AuthSession): User => {
    tokenStorage.save(session.tokens.accessToken, session.tokens.refreshToken);
    setUser(session.user);
    return session.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<User> => {
      const session = await apiPost<AuthSession>('/auth/login', { email, password });
      return applySession(session);
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterPatientInput): Promise<User> => {
      const session = await apiPost<AuthSession>('/auth/register', input);
      return applySession(session);
    },
    [applySession],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiPost<{ message: string }>('/auth/logout', {
        refreshToken: tokenStorage.getRefreshToken() ?? undefined,
      });
    } catch {
      // Peu importe l'échec côté serveur : la session locale est effacée.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshUser = useCallback(async (): Promise<void> => {
    if (!tokenStorage.getAccessToken()) return;
    const profile = await apiGet<User>('/auth/me');
    setUser(profile);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = user?.permissions ?? [];
    const roles = user?.roles ?? [];

    return {
      user,
      isLoading,
      isAuthenticated: user !== null,
      isStaff: roles.some((role) => STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])),
      isPatient: roles.includes('PATIENT'),
      login,
      register,
      logout,
      refreshUser,
      hasPermission: (permission: string) => hasPermission(permissions, permission),
      hasAnyPermission: (required: string[]) => hasAnyPermission(permissions, required),
      hasRole: (role: string) => roles.includes(role),
    };
  }, [user, isLoading, login, register, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Accès au contexte d'authentification (hors provider : erreur explicite). */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l’intérieur d’un <AuthProvider>.');
  }
  return context;
}
