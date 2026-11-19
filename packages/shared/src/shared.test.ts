/**
 * Tests du paquet partagé.
 *
 * Ces tests verrouillent les contrats utilisés des deux côtés : les schémas de
 * validation (identiques en front et en back) et les formateurs d'affichage.
 */

import { describe, expect, it } from 'vitest';

import {
  loginSchema,
  createAppointmentSchema,
  createPrescriptionSchema,
  registerPatientSchema,
  publicBookingSchema,
  adjustStockSchema,
} from './schemas';
import { formatAge, formatMoney, formatDate, formatDateTime, initials, buildQueryString } from './formatters';

describe('loginSchema', () => {
  it('accepte des identifiants valides', () => {
    const result = loginSchema.safeParse({ email: 'Test@MediClinic.FR', password: 'secret' });
    expect(result.success).toBe(true);
    // L'email est normalisé en minuscules pour éviter les doublons de compte.
    if (result.success) expect(result.data.email).toBe('test@mediclinic.fr');
  });

  it('rejette un email invalide', () => {
    const result = loginSchema.safeParse({ email: 'pas-un-email', password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejette un mot de passe vide', () => {
    expect(loginSchema.safeParse({ email: 'a@b.fr', password: '' }).success).toBe(false);
  });
});

describe('registerPatientSchema', () => {
  const valid = {
    email: 'patient@email.fr',
    password: 'Passw0rd!2026',
    confirmPassword: 'Passw0rd!2026',
    firstName: 'Lucie',
    lastName: 'Durand',
    birthDate: '1990-05-12',
    gender: 'FEMALE' as const,
  };

  it('accepte une inscription complète', () => {
    expect(registerPatientSchema.safeParse(valid).success).toBe(true);
  });

  it('refuse des mots de passe différents', () => {
    const result = registerPatientSchema.safeParse({ ...valid, confirmPassword: 'Autre1234' });
    expect(result.success).toBe(false);
  });

  it('refuse une date de naissance future', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const result = registerPatientSchema.safeParse({
      ...valid,
      birthDate: future.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(false);
  });

  it('exige un mot de passe d’au moins 8 caractères avec chiffre et lettre', () => {
    expect(registerPatientSchema.safeParse({ ...valid, password: 'court1', confirmPassword: 'court1' }).success).toBe(false);
    expect(registerPatientSchema.safeParse({ ...valid, password: 'sanschiffre', confirmPassword: 'sanschiffre' }).success).toBe(false);
  });
});

describe('createAppointmentSchema', () => {
  const valid = {
    patientId: 1,
    doctorId: 2,
    scheduledAt: '2026-12-01 10:00:00',
    duration: 30,
    type: 'IN_PERSON' as const,
  };

  it('accepte un rendez-vous valide', () => {
    expect(createAppointmentSchema.safeParse(valid).success).toBe(true);
  });

  it('convertit les identifiants fournis en chaîne', () => {
    const result = createAppointmentSchema.safeParse({ ...valid, patientId: '7' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.patientId).toBe(7);
  });

  it('refuse une durée hors bornes', () => {
    expect(createAppointmentSchema.safeParse({ ...valid, duration: 5 }).success).toBe(false);
    expect(createAppointmentSchema.safeParse({ ...valid, duration: 500 }).success).toBe(false);
  });
});

describe('publicBookingSchema', () => {
  it('accepte une réservation en ligne sans compte', () => {
    const result = publicBookingSchema.safeParse({
      doctorId: 3,
      scheduledAt: '2026-12-02 09:00:00',
      firstName: 'Pierre',
      lastName: 'Lambert',
      email: 'pierre@email.fr',
      birthDate: '1985-03-20',
      gender: 'MALE',
      reason: 'Douleurs persistantes au genou droit',
    });
    expect(result.success).toBe(true);
  });

  it('applique le type « présentiel » par défaut', () => {
    const result = publicBookingSchema.safeParse({
      doctorId: 3,
      scheduledAt: '2026-12-02 09:00:00',
      firstName: 'Pierre',
      lastName: 'Lambert',
      email: 'pierre@email.fr',
      reason: 'Consultation de suivi',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe('IN_PERSON');
  });

  it('exige un motif suffisamment explicite', () => {
    const result = publicBookingSchema.safeParse({
      doctorId: 3,
      scheduledAt: '2026-12-02 09:00:00',
      firstName: 'Pierre',
      lastName: 'Lambert',
      email: 'pierre@email.fr',
      reason: 'mal',
    });
    expect(result.success).toBe(false);
  });
});

describe('createPrescriptionSchema', () => {
  it('exige au moins un médicament', () => {
    expect(createPrescriptionSchema.safeParse({ consultationId: 1, items: [] }).success).toBe(false);
  });

  it('accepte une ordonnance avec deux lignes', () => {
    const result = createPrescriptionSchema.safeParse({
      consultationId: 1,
      items: [
        { medicationId: 1, dosage: '1 comprimé', frequency: '2 fois par jour', duration: '7 jours', quantity: 14 },
        { medicationId: 5, dosage: '2 bouffées', frequency: '3 fois par jour', duration: '1 mois', quantity: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('refuse une quantité nulle', () => {
    const result = createPrescriptionSchema.safeParse({
      consultationId: 1,
      items: [{ medicationId: 1, dosage: '1', frequency: '1', duration: '1', quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('adjustStockSchema', () => {
  it('accepte une entrée de stock', () => {
    expect(adjustStockSchema.safeParse({ type: 'IN', quantity: 50, reason: 'Réception' }).success).toBe(true);
  });

  it('refuse une quantité négative', () => {
    expect(adjustStockSchema.safeParse({ type: 'IN', quantity: -5, reason: 'Erreur' }).success).toBe(false);
  });

  it('refuse un type inconnu', () => {
    expect(adjustStockSchema.safeParse({ type: 'MOVE', quantity: 1, reason: 'Test' }).success).toBe(false);
  });
});

describe('Formateurs', () => {
  it('formate un montant en euros', () => {
    const formatted = formatMoney(1234.5);
    expect(formatted).toContain('1');
    expect(formatted).toContain('234');
    expect(formatted).toMatch(/€|EUR/);
  });

  it('accepte un montant fourni en chaîne (DECIMAL MySQL)', () => {
    expect(formatMoney('70.00')).toContain('70');
  });

  it('affiche un tiret pour un montant absent', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
  });

  it('formate une date au format français', () => {
    expect(formatDate('2026-11-18')).toMatch(/18\/11\/2026/);
  });

  it('formate une date et une heure', () => {
    const formatted = formatDateTime('2026-11-18 09:30:00');
    expect(formatted).toMatch(/18\/11\/2026/);
    expect(formatted).toMatch(/09:30/);
  });

  it('calcule un âge', () => {
    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - 30);
    const age = formatAge(birth.toISOString().slice(0, 10));
    expect(age).toMatch(/30 ans/);
  });

  it('calcule des initiales', () => {
    expect(initials('Lucie', 'Durand')).toBe('LD');
  });

  it('construit une query string en ignorant les vides', () => {
    const query = buildQueryString({ page: 2, search: '', status: 'PAID', empty: undefined });
    expect(query).toBe('?page=2&status=PAID');
  });
});
