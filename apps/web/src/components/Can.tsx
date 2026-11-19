/**
 * Composant de contrôle d'affichage par permission.
 *
 * @example
 * <Can permission="patient:create">
 *   <Button>Nouveau patient</Button>
 * </Can>
 *
 * @example
 * <Can anyOf={['invoice:create', 'invoice:manage']} fallback={<p>Accès restreint</p>}>
 *   <InvoiceForm />
 * </Can>
 */

import type { ReactNode } from 'react';

import { useAuth } from '@/contexts/AuthContext';

interface CanProps {
  /** Permission unique exigée. */
  permission?: string;
  /** Au moins une de ces permissions est exigée. */
  anyOf?: string[];
  /** Toutes ces permissions sont exigées. */
  allOf?: string[];
  /** Rôle exigé (contrôle grossier). */
  role?: string;
  /** Contenu affiché si l'accès est refusé. */
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ permission, anyOf, allOf, role, fallback = null, children }: CanProps): JSX.Element {
  const { hasPermission, hasAnyPermission, hasRole, user } = useAuth();

  if (!user) return <>{fallback}</>;

  const checks: boolean[] = [];

  if (permission) checks.push(hasPermission(permission));
  if (anyOf && anyOf.length > 0) checks.push(hasAnyPermission(anyOf));
  if (allOf && allOf.length > 0) checks.push(allOf.every((code) => hasPermission(code)));
  if (role) checks.push(hasRole(role));

  // Aucun critère fourni : le contenu est affiché à tout utilisateur connecté.
  const allowed = checks.length === 0 ? true : checks.every(Boolean);

  return <>{allowed ? children : fallback}</>;
}

/**
 * Variante impérative, utile pour désactiver un bouton plutôt que le masquer.
 *
 * @example
 * const canCreate = useCan('patient:create');
 */
export function useCan(permission: string): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(permission);
}
