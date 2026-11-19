/**
 * Matrice des permissions — source de vérité partagée entre le front et le back.
 *
 * Ce fichier est le miroir exact de la section 2 et 3 de
 * `database/migrations/003_seed.sql`. Toute modification doit être reportée
 * dans les deux fichiers (un test de cohérence le vérifie côté API).
 *
 * Convention de nommage : `resource:action` (ex. `patient:create`).
 */

import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  ROLES,
  type PermissionAction,
  type PermissionResource,
  type RoleCode,
} from './constants';

/** Code de permission typé : `patient:create`, `stock:manage`, … */
export type PermissionCode = `${PermissionResource}:${PermissionAction}`;

/**
 * Actions autorisées pour chaque ressource.
 * Toutes les combinaisons ne font pas sens (`dashboard:delete` n'existe pas).
 */
export const RESOURCE_ACTIONS: Record<PermissionResource, readonly PermissionAction[]> = {
  patient: ['create', 'read', 'update', 'delete'],
  doctor: ['create', 'read', 'update', 'delete'],
  specialty: ['create', 'read', 'update', 'delete'],
  department: ['create', 'read', 'update', 'delete'],
  appointment: ['create', 'read', 'update', 'delete'],
  consultation: ['create', 'read', 'update', 'delete'],
  prescription: ['create', 'read', 'update', 'delete', 'manage'],
  medication: ['create', 'read', 'update', 'delete'],
  stock: ['create', 'read', 'update', 'manage'],
  invoice: ['create', 'read', 'update', 'delete', 'manage'],
  payment: ['create', 'read', 'update', 'delete'],
  shift: ['create', 'read', 'update', 'delete'],
  meeting: ['create', 'read', 'update', 'delete', 'manage'],
  lab: ['create', 'read', 'update', 'delete'],
  audit: ['read'],
  role: ['create', 'read', 'update', 'delete', 'manage'],
  user: ['create', 'read', 'update', 'delete', 'manage'],
  dashboard: ['read'],
  report: ['read'],
  notification: ['read', 'update', 'delete'],
  settings: ['read', 'update'],
};

/** Liste exhaustive des 77 permissions de l'application. */
export const PERMISSION_CODES: readonly PermissionCode[] = PERMISSION_RESOURCES.flatMap((resource) =>
  RESOURCE_ACTIONS[resource].map((action) => `${resource}:${action}` as PermissionCode),
);

/** Index de contrôle rapide (validation des entrées, tests). */
export const PERMISSION_CODE_SET: ReadonlySet<string> = new Set<string>(PERMISSION_CODES);

/**
 * Permissions attribuées par défaut à chaque rôle.
 * Utilisé par le script de seed et par le contrôle d'accès de secours.
 */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  SUPER_ADMIN: PERMISSION_CODES,

  // L'administrateur gère la clinique, mais pas la matrice des rôles
  // (réservée au SUPER_ADMIN).
  ADMIN: PERMISSION_CODES.filter(
    (code) => !['role:create', 'role:update', 'role:delete', 'role:manage'].includes(code),
  ),

  DOCTOR: [
    'patient:read', 'patient:update',
    'doctor:read', 'specialty:read', 'department:read',
    'appointment:read', 'appointment:update',
    'consultation:create', 'consultation:read', 'consultation:update',
    'prescription:create', 'prescription:read', 'prescription:update', 'prescription:manage',
    'medication:read', 'stock:read',
    'lab:create', 'lab:read', 'lab:update',
    'meeting:create', 'meeting:read', 'meeting:update', 'meeting:manage',
    'shift:read', 'dashboard:read', 'report:read',
    'notification:read', 'notification:update',
  ],

  NURSE: [
    'patient:create', 'patient:read', 'patient:update',
    'doctor:read', 'specialty:read', 'department:read',
    'appointment:create', 'appointment:read', 'appointment:update',
    'consultation:read', 'prescription:read',
    'medication:read', 'stock:read',
    'lab:create', 'lab:read', 'lab:update',
    'meeting:read', 'shift:read', 'dashboard:read',
    'notification:read', 'notification:update',
  ],

  PHARMACIST: [
    'patient:read',
    'medication:create', 'medication:read', 'medication:update', 'medication:delete',
    'stock:create', 'stock:read', 'stock:update', 'stock:manage',
    'prescription:read', 'prescription:manage',
    'invoice:read', 'payment:read',
    'dashboard:read', 'report:read',
    'notification:read', 'notification:update',
  ],

  RECEPTIONIST: [
    'patient:create', 'patient:read', 'patient:update', 'patient:delete',
    'doctor:read', 'specialty:read', 'department:read',
    'appointment:create', 'appointment:read', 'appointment:update', 'appointment:delete',
    'consultation:read',
    'invoice:create', 'invoice:read',
    'payment:create', 'payment:read',
    'meeting:create', 'meeting:read', 'meeting:update',
    'shift:read', 'dashboard:read',
    'notification:read', 'notification:update',
  ],

  ACCOUNTANT: [
    'patient:read', 'doctor:read', 'appointment:read', 'consultation:read',
    'invoice:create', 'invoice:read', 'invoice:update', 'invoice:delete', 'invoice:manage',
    'payment:create', 'payment:read', 'payment:update', 'payment:delete',
    'report:read', 'dashboard:read',
    'notification:read', 'notification:update',
  ],

  PATIENT: [
    'patient:read', 'patient:update',
    'appointment:create', 'appointment:read',
    'consultation:read', 'prescription:read',
    'invoice:read', 'payment:read', 'lab:read',
    'meeting:create', 'meeting:read',
    'dashboard:read',
    'notification:read', 'notification:update',
  ],
};

/** Vérifie qu'un code de permission est valide (protection contre les fautes de frappe). */
export function isValidPermission(code: string): code is PermissionCode {
  return PERMISSION_CODE_SET.has(code);
}

/** L'utilisateur possède-t-il la permission demandée ? */
export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  // `resource:manage` implique `resource:create|read|update|delete`.
  const [resource] = required.split(':');
  return resource !== undefined && granted.includes(`${resource}:manage`);
}

/** L'utilisateur possède-t-il au moins une des permissions demandées ? */
export function hasAnyPermission(granted: readonly string[], required: readonly string[]): boolean {
  return required.some((code) => hasPermission(granted, code));
}

/** L'utilisateur possède-t-il toutes les permissions demandées ? */
export function hasAllPermissions(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((code) => hasPermission(granted, code));
}

/** Union des permissions de plusieurs rôles (dédoublonnée). */
export function permissionsForRoles(roles: readonly RoleCode[]): PermissionCode[] {
  const result = new Set<PermissionCode>();
  for (const role of roles) {
    for (const code of ROLE_PERMISSIONS[role] ?? []) result.add(code);
  }
  return [...result];
}

/** Contrôle de cohérence : tous les codes de la matrice existent-ils ? */
export function validatePermissionMatrix(): string[] {
  const errors: string[] = [];
  for (const role of ROLES) {
    for (const code of ROLE_PERMISSIONS[role]) {
      if (!isValidPermission(code)) errors.push(`Rôle ${role} : permission inconnue « ${code} »`);
    }
  }
  for (const action of PERMISSION_ACTIONS) {
    if (!PERMISSION_ACTIONS.includes(action)) errors.push(`Action invalide : ${action}`);
  }
  return errors;
}
