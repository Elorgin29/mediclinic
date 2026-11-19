/**
 * Garde de routes.
 *
 * Trois niveaux de protection :
 *  - `ProtectedRoute` : utilisateur authentifié requis ;
 *  - `permission` / `anyOf` : droits fins issus du RBAC ;
 *  - `role` : contrôle grossier (espace patient, espace staff).
 *
 * En cas de refus, l'utilisateur est redirigé vers la page de connexion en
 * conservant sa destination initiale, ou vers une page « accès refusé ».
 */

import { useAuth } from '@/contexts/AuthContext';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { FullPageLoader } from '@/components/layouts/PageHeader';

interface ProtectedRouteProps {
  /** L'utilisateur doit appartenir au personnel. */
  staffOnly?: boolean;
  /** L'utilisateur doit avoir le rôle PATIENT. */
  patientOnly?: boolean;
  /** Permission unique requise. */
  permission?: string;
  /** Au moins une des permissions requises. */
  anyOf?: string[];
  children?: ReactNode;
}

export function ProtectedRoute({
  staffOnly = false,
  patientOnly = false,
  permission,
  anyOf,
  children,
}: ProtectedRouteProps): JSX.Element {
  const { user, isLoading, isStaff, isPatient, hasPermission, hasAnyPermission } = useAuth();
  const location = useLocation();

  // Tant que la session n'est pas résolue, on évite un clignotement de redirection.
  if (isLoading) return <FullPageLoader label="Vérification de votre session…" />;

  if (!user) {
    return <Navigate to="/connexion" replace state={{ from: location.pathname + location.search }} />;
  }

  if (staffOnly && !isStaff) return <Navigate to="/acces-refuse" replace />;
  if (patientOnly && !isPatient) return <Navigate to="/acces-refuse" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/acces-refuse" replace />;
  if (anyOf && anyOf.length > 0 && !hasAnyPermission(anyOf)) {
    return <Navigate to="/acces-refuse" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

/** Redirige un utilisateur déjà connecté vers son espace. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }): JSX.Element {
  const { user, isLoading, isPatient, isStaff } = useAuth();

  if (isLoading) return <FullPageLoader label="Chargement…" />;
  if (user) return <Navigate to={isPatient && !isStaff ? '/patient' : '/admin'} replace />;

  return <>{children}</>;
}
