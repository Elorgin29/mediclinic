/**
 * Tests unitaires du RBAC.
 *
 * Ces tests ne touchent PAS la base : ils vérifient la matrice de permissions
 * et la logique de contrôle d'accès, qui sont le cœur de la sécurité de
 * l'application. Ils s'exécutent donc partout, y compris sans MySQL.
 */

import { describe, expect, it } from 'vitest';

import {
  PERMISSION_CODES,
  ROLE_PERMISSIONS,
  ROLES,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isValidPermission,
  permissionsForRoles,
  validatePermissionMatrix,
} from '@mediclinic/shared';

describe('Matrice des permissions', () => {
  it('déclare 77 permissions', () => {
    expect(PERMISSION_CODES).toHaveLength(77);
  });

  it('ne contient aucun doublon', () => {
    expect(new Set(PERMISSION_CODES).size).toBe(PERMISSION_CODES.length);
  });

  it('respecte la convention resource:action', () => {
    for (const code of PERMISSION_CODES) {
      expect(code).toMatch(/^[a-z]+:(create|read|update|delete|manage)$/);
    }
  });

  it('passe le contrôle de cohérence interne', () => {
    expect(validatePermissionMatrix()).toEqual([]);
  });

  it('attribue toutes les permissions au SUPER_ADMIN', () => {
    expect([...ROLE_PERMISSIONS.SUPER_ADMIN].sort()).toEqual([...PERMISSION_CODES].sort());
  });

  it('n’attribue aucune permission de gestion des rôles à ADMIN', () => {
    for (const code of ['role:create', 'role:update', 'role:delete', 'role:manage'] as const) {
      expect(ROLE_PERMISSIONS.ADMIN).not.toContain(code);
    }
  });

  it('donne au patient un accès strictement limité à ses données', () => {
    const patientPermissions = ROLE_PERMISSIONS.PATIENT;

    // Le patient peut réserver et consulter ses documents…
    expect(patientPermissions).toContain('appointment:create');
    expect(patientPermissions).toContain('appointment:read');
    expect(patientPermissions).toContain('prescription:read');

    // …mais ne peut ni créer de dossier patient, ni accéder au stock.
    expect(patientPermissions).not.toContain('patient:create');
    expect(patientPermissions).not.toContain('stock:read');
    expect(patientPermissions).not.toContain('invoice:create');
  });

  it('permet au pharmacien de gérer le stock mais pas les factures', () => {
    expect(ROLE_PERMISSIONS.PHARMACIST).toContain('stock:manage');
    expect(ROLE_PERMISSIONS.PHARMACIST).toContain('prescription:manage');
    expect(ROLE_PERMISSIONS.PHARMACIST).not.toContain('invoice:create');
  });

  it('permet au comptable de facturer mais pas de prescrire', () => {
    expect(ROLE_PERMISSIONS.ACCOUNTANT).toContain('invoice:create');
    expect(ROLE_PERMISSIONS.ACCOUNTANT).toContain('payment:create');
    expect(ROLE_PERMISSIONS.ACCOUNTANT).not.toContain('prescription:create');
  });

  it('définit les permissions pour les huit rôles', () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});

describe('Vérification des permissions', () => {
  it('reconnaît un code valide', () => {
    expect(isValidPermission('patient:read')).toBe(true);
    expect(isValidPermission('patient:fly')).toBe(false);
    expect(isValidPermission('')).toBe(false);
  });

  it('accorde une permission explicitement listée', () => {
    expect(hasPermission(['patient:read'], 'patient:read')).toBe(true);
    expect(hasPermission(['patient:read'], 'patient:create')).toBe(false);
  });

  it('fait impliquer manage sur toutes les actions de la ressource', () => {
    expect(hasPermission(['invoice:manage'], 'invoice:create')).toBe(true);
    expect(hasPermission(['invoice:manage'], 'invoice:delete')).toBe(true);
    // `manage` ne déborde pas sur une autre ressource.
    expect(hasPermission(['invoice:manage'], 'payment:create')).toBe(false);
  });

  it('gère le joker global', () => {
    expect(hasPermission(['*'], 'audit:read')).toBe(true);
  });

  it('vérifie any / all correctement', () => {
    const granted = ['patient:read', 'appointment:create'];

    expect(hasAnyPermission(granted, ['patient:read', 'stock:read'])).toBe(true);
    expect(hasAnyPermission(granted, ['stock:read', 'audit:read'])).toBe(false);

    expect(hasAllPermissions(granted, ['patient:read', 'appointment:create'])).toBe(true);
    expect(hasAllPermissions(granted, ['patient:read', 'stock:read'])).toBe(false);
  });

  it('fusionne les permissions de plusieurs rôles sans doublon', () => {
    const merged = permissionsForRoles(['DOCTOR', 'PHARMACIST']);

    expect(merged).toContain('consultation:create');
    expect(merged).toContain('stock:manage');
    expect(new Set(merged).size).toBe(merged.length);
  });
});
