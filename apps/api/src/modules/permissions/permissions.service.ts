/**
 * Règles métier du référentiel des permissions.
 *
 * Aucune écriture ici : les permissions sont un catalogue fixe, aligné sur
 * `packages/shared/src/permissions.ts` et sur le seed SQL. Ce service ne fait
 * que mettre en forme les données pour l'interface d'administration du RBAC.
 */

import {
  PERMISSION_ACTIONS,
  PERMISSION_ACTION_LABELS_FR,
  PERMISSION_RESOURCE_LABELS_FR,
  type Permission,
  type PermissionAction,
  type PermissionResource,
} from '@mediclinic/shared';

import * as repository from './permissions.repository.js';
import type { PermissionRecord } from './permissions.repository.js';

import { query, type Row } from '../../config/db.js';

/** Ligne minimale d'un rôle, pour la matrice. */
interface RoleSummaryRow extends Row {
  id: number;
  code: string;
  name: string;
  is_system: number;
}

/** Convertit une ligne SQL en objet exposé par l'API. */
export function toPermission(record: PermissionRecord): Permission {
  return {
    id: record.id,
    code: record.code,
    resource: record.resource as PermissionResource,
    action: record.action as PermissionAction,
    description: record.description,
  };
}

/** Groupe de permissions pour une ressource donnée. */
export interface PermissionGroup {
  resource: PermissionResource;
  resourceLabel: string;
  actions: Array<{
    id: number;
    code: string;
    action: PermissionAction;
    description: string | null;
  }>;
}

/** Référentiel complet. */
export async function listPermissions(): Promise<Permission[]> {
  const records = await repository.findPermissions();
  return records.map(toPermission);
}

/**
 * Permissions regroupées par ressource.
 *
 * L'ordre des ressources suit `PERMISSION_RESOURCES` (et non l'alphabet) pour
 * que l'écran de matrice présente les domaines dans un ordre métier cohérent :
 * patients, rendez-vous, consultations, pharmacie, facturation, administration.
 */
export async function listGrouped(): Promise<PermissionGroup[]> {
  const permissions = await listPermissions();
  const groups = new Map<string, PermissionGroup>();

  for (const permission of permissions) {
    const key = String(permission.resource);
    let group = groups.get(key);

    if (!group) {
      group = {
        resource: permission.resource as PermissionResource,
        resourceLabel:
          PERMISSION_RESOURCE_LABELS_FR[permission.resource as PermissionResource] ?? key,
        actions: [],
      };
      groups.set(key, group);
    }

    group.actions.push({
      id: permission.id,
      code: permission.code,
      action: permission.action as PermissionAction,
      description: permission.description,
    });
  }

  // Tri des actions dans l'ordre canonique : create, read, update, delete, manage.
  for (const group of groups.values()) {
    group.actions.sort(
      (a, b) => PERMISSION_ACTIONS.indexOf(a.action) - PERMISSION_ACTIONS.indexOf(b.action),
    );
  }

  return [...groups.values()];
}

/** Charge utile de la matrice rôle → permissions. */
export interface PermissionMatrixPayload {
  roles: Array<{ id: number; code: string; name: string; is_system: boolean }>;
  permissions: Permission[];
  matrix: Record<number, number[]>;
}

/**
 * Matrice complète utilisée par l'écran `/admin/roles`.
 *
 * Les rôles proviennent du module des rôles ; la matrice est renvoyée sous
 * forme d'objet `{ [roleId]: permissionId[] }` pour être consommée directement
 * par les cases à cocher du front.
 */
export async function getMatrix(): Promise<PermissionMatrixPayload> {
  const [permissions, matrix, roles] = await Promise.all([
    listPermissions(),
    repository.findRolePermissionMatrix(),
    // Requête directe sur `roles` : ce service ne dépend pas du module des rôles
    // (évite une dépendance circulaire entre les deux modules).
    query<RoleSummaryRow>('SELECT id, code, name, is_system FROM roles ORDER BY is_system DESC, name ASC'),
  ]);

  return {
    roles: roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      is_system: Boolean(role.is_system),
    })),
    permissions,
    matrix: Object.fromEntries(matrix.entries()),
  };
}

/** Libellés français, exposés pour les écrans d'administration. */
export const labels = {
  actions: PERMISSION_ACTION_LABELS_FR,
  resources: PERMISSION_RESOURCE_LABELS_FR,
};
