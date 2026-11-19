/**
 * Schémas Zod partagés front/back.
 * Toute route de l'API valide ses entrées avec ces schémas ; le front les
 * réutilise via @hookform/resolvers/zod pour une validation identique.
 */

import { z } from 'zod';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  BLOOD_GROUPS,
  GENDERS,
  INVOICE_STATUSES,
  MEETING_STATUSES,
  NOTIFICATION_TYPES,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  PASSWORD_MIN_LENGTH,
  PAYMENT_METHODS,
  PRESCRIPTION_STATUSES,
  ROLES,
  SHIFT_STATUSES,
  SHIFT_TYPES,
  STOCK_MOVEMENT_TYPES,
  LAB_REQUEST_STATUSES,
} from './constants';

/* -------------------------------------------------------------------------- */
/* Helpers réutilisables                                                       */
/* -------------------------------------------------------------------------- */

export const idSchema = z.coerce.number().int().positive('Identifiant invalide');

export const emailSchema = z
  .string({ required_error: "L'email est obligatoire" })
  .trim()
  .toLowerCase()
  .email('Format d’email invalide');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9 ().-]{6,25}$/, 'Numéro de téléphone invalide')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const passwordSchema = z
  .string({ required_error: 'Le mot de passe est obligatoire' })
  .min(PASSWORD_MIN_LENGTH, `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères`)
  .max(72, 'Le mot de passe ne peut pas dépasser 72 caractères')
  .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre');

export const dateSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Date invalide');

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ');

export const dateTimeSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Date et heure invalides');

export const moneySchema = z.coerce
  .number()
  .min(0, 'Le montant ne peut pas être négatif')
  .max(99_999_999, 'Montant trop élevé');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
});

export const listQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(40).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/* -------------------------------------------------------------------------- */
/* Authentification                                                            */
/* -------------------------------------------------------------------------- */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Le mot de passe est obligatoire'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerPatientSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    firstName: z.string().trim().min(1, 'Le prénom est obligatoire').max(80),
    lastName: z.string().trim().min(1, 'Le nom est obligatoire').max(80),
    phone: phoneSchema,
    birthDate: dateOnlySchema,
    gender: z.enum(GENDERS, { errorMap: () => ({ message: 'Genre invalide' }) }),
    address: z.string().trim().max(255).optional(),
    city: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().max(10).optional(),
    insuranceNumber: z.string().trim().max(50).optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })
  .refine((d) => new Date(d.birthDate) <= new Date(), {
    message: 'La date de naissance ne peut pas être dans le futur',
    path: ['birthDate'],
  });
export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

/* -------------------------------------------------------------------------- */
/* Utilisateurs & RBAC                                                         */
/* -------------------------------------------------------------------------- */

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1, 'Prénom requis').max(80),
  lastName: z.string().trim().min(1, 'Nom requis').max(80),
  phone: phoneSchema,
  roleCodes: z.array(z.enum(ROLES)).min(1, 'Sélectionnez au moins un rôle'),
  isActive: z.boolean().default(true),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: phoneSchema,
  roleCodes: z.array(z.enum(ROLES)).min(1).optional(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Le code doit être en MAJUSCULES avec des underscores'),
  name: z.string().trim().min(2, 'Nom requis').max(80),
  description: z.string().trim().max(255).optional(),
  permissionIds: z.array(idSchema).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.partial().omit({ code: true });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

/* -------------------------------------------------------------------------- */
/* Patients                                                                    */
/* -------------------------------------------------------------------------- */

const patientBase = {
  firstName: z.string().trim().min(1, 'Prénom requis').max(80),
  lastName: z.string().trim().min(1, 'Nom requis').max(80),
  birthDate: dateOnlySchema,
  gender: z.enum(GENDERS),
  address: z.string().trim().max(255).optional(),
  city: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(10).optional(),
  phone: phoneSchema,
  email: z.union([emailSchema, z.literal('')]).optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  allergies: z.string().trim().max(1000).optional(),
  medicalHistory: z.string().trim().max(2000).optional(),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: phoneSchema,
  insuranceNumber: z.string().trim().max(50).optional(),
};

export const createPatientSchema = z.object(patientBase);
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = z.object(patientBase).partial();
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

export const patientQuerySchema = listQuerySchema.extend({
  gender: z.enum(GENDERS).optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: phoneSchema,
  address: z.string().trim().max(255).optional(),
  city: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(10).optional(),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: phoneSchema,
  allergies: z.string().trim().max(1000).optional(),
});

/* -------------------------------------------------------------------------- */
/* Spécialités, départements, médecins                                         */
/* -------------------------------------------------------------------------- */

export const specialtySchema = z.object({
  name: z.string().trim().min(2, 'Nom requis').max(80),
  description: z.string().trim().max(500).optional(),
});
export const updateSpecialtySchema = specialtySchema.partial();

export const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis').max(80),
  description: z.string().trim().max(500).optional(),
  headDoctorId: idSchema.nullable().optional(),
});
export const updateDepartmentSchema = departmentSchema.partial();

export const createDoctorSchema = z.object({
  userId: idSchema,
  specialtyId: idSchema,
  departmentId: idSchema.nullable().optional(),
  licenseNumber: z.string().trim().min(3, 'Numéro d’ordre requis').max(50),
  consultationFee: moneySchema,
  bio: z.string().trim().max(2000).optional(),
  isAcceptingPatients: z.boolean().default(true),
});
export const updateDoctorSchema = createDoctorSchema.partial().omit({ userId: true });

/* -------------------------------------------------------------------------- */
/* Rendez-vous                                                                 */
/* -------------------------------------------------------------------------- */

export const createAppointmentSchema = z.object({
  patientId: idSchema,
  doctorId: idSchema,
  departmentId: idSchema.nullable().optional(),
  scheduledAt: dateTimeSchema,
  duration: z.coerce.number().int().min(10, 'Durée minimale : 10 minutes').max(240).default(30),
  type: z.enum(APPOINTMENT_TYPES).default('IN_PERSON'),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  doctorId: idSchema.optional(),
  departmentId: idSchema.nullable().optional(),
  scheduledAt: dateTimeSchema.optional(),
  duration: z.coerce.number().int().min(10).max(240).optional(),
  type: z.enum(APPOINTMENT_TYPES).optional(),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
});

export const appointmentStatusSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

export const appointmentQuerySchema = listQuerySchema.extend({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  type: z.enum(APPOINTMENT_TYPES).optional(),
  doctorId: idSchema.optional(),
  patientId: idSchema.optional(),
  departmentId: idSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

/** Réservation publique (front office) : le patient réserve sans être connecté. */
export const publicBookingSchema = z.object({
  doctorId: idSchema,
  scheduledAt: dateTimeSchema,
  type: z.enum(APPOINTMENT_TYPES).default('IN_PERSON'),
  reason: z.string().trim().min(5, 'Merci de préciser le motif').max(500),
  firstName: z.string().trim().min(1, 'Prénom requis').max(80),
  lastName: z.string().trim().min(1, 'Nom requis').max(80),
  email: emailSchema,
  phone: phoneSchema,
  birthDate: dateOnlySchema.optional(),
  gender: z.enum(GENDERS).optional(),
});
export type PublicBookingInput = z.infer<typeof publicBookingSchema>;

export const availabilityQuerySchema = z.object({
  doctorId: idSchema,
  date: dateOnlySchema,
});

/* -------------------------------------------------------------------------- */
/* Consultations & ordonnances                                                 */
/* -------------------------------------------------------------------------- */

export const createConsultationSchema = z.object({
  appointmentId: idSchema,
  diagnosis: z.string().trim().min(2, 'Diagnostic requis').max(2000),
  notes: z.string().trim().max(5000).optional(),
  followUpAt: dateOnlySchema.optional(),
});
export type CreateConsultationInput = z.infer<typeof createConsultationSchema>;

export const updateConsultationSchema = z.object({
  diagnosis: z.string().trim().min(2).max(2000).optional(),
  notes: z.string().trim().max(5000).optional(),
  followUpAt: dateOnlySchema.nullable().optional(),
});

export const prescriptionItemSchema = z.object({
  medicationId: idSchema,
  dosage: z.string().trim().min(1, 'Posologie requise').max(120),
  frequency: z.string().trim().min(1, 'Fréquence requise').max(120),
  duration: z.string().trim().min(1, 'Durée requise').max(120),
  instructions: z.string().trim().max(500).optional(),
  quantity: z.coerce.number().int().min(1, 'Quantité minimale : 1').max(1000).default(1),
});

export const createPrescriptionSchema = z.object({
  consultationId: idSchema,
  items: z.array(prescriptionItemSchema).min(1, 'Ajoutez au moins un médicament'),
});
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;

export const updatePrescriptionSchema = z.object({
  status: z.enum(PRESCRIPTION_STATUSES),
});

export const dispenseSchema = z.object({
  prescriptionId: idSchema,
});

/* -------------------------------------------------------------------------- */
/* Pharmacie                                                                   */
/* -------------------------------------------------------------------------- */

export const createMedicationSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis').max(120),
  category: z.string().trim().min(2, 'Catégorie requise').max(80),
  unit: z.string().trim().min(1, 'Unité requise').max(30),
  price: moneySchema,
  stockQuantity: z.coerce.number().int().min(0).default(0),
  alertThreshold: z.coerce.number().int().min(0).default(10),
  expiryDate: dateOnlySchema.optional(),
  supplier: z.string().trim().max(120).optional(),
});
export type CreateMedicationInput = z.infer<typeof createMedicationSchema>;

export const updateMedicationSchema = createMedicationSchema.partial();

export const adjustStockSchema = z.object({
  type: z.enum(STOCK_MOVEMENT_TYPES),
  quantity: z.coerce.number().int().min(1, 'Quantité minimale : 1').max(100000),
  reason: z.string().trim().min(2, 'Motif requis').max(255),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const stockQuerySchema = listQuerySchema.extend({
  medicationId: idSchema.optional(),
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const medicationQuerySchema = listQuerySchema.extend({
  category: z.string().trim().max(80).optional(),
  lowStock: z.coerce.boolean().optional(),
});

/* -------------------------------------------------------------------------- */
/* Facturation                                                                 */
/* -------------------------------------------------------------------------- */

export const invoiceItemSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis').max(200),
  quantity: z.coerce.number().int().min(1, 'Quantité minimale : 1').max(1000),
  unitPrice: moneySchema,
});

export const createInvoiceSchema = z.object({
  patientId: idSchema,
  consultationId: idSchema.nullable().optional(),
  items: z.array(invoiceItemSchema).min(1, 'Ajoutez au moins une ligne'),
  vatRate: z.coerce.number().min(0).max(100).default(20),
  dueDate: dateOnlySchema.optional(),
  status: z.enum(['DRAFT', 'ISSUED']).default('ISSUED'),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceSchema = z.object({
  items: z.array(invoiceItemSchema).min(1).optional(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
  dueDate: dateOnlySchema.optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
});

export const invoiceQuerySchema = listQuerySchema.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  patientId: idSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const createPaymentSchema = z.object({
  amount: z.coerce.number().positive('Le montant doit être supérieur à 0'),
  method: z.enum(PAYMENT_METHODS),
  paidAt: dateTimeSchema.optional(),
  reference: z.string().trim().max(120).optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/* -------------------------------------------------------------------------- */
/* Gardes                                                                      */
/* -------------------------------------------------------------------------- */

export const createShiftSchema = z
  .object({
    doctorId: idSchema,
    departmentId: idSchema,
    startAt: dateTimeSchema,
    endAt: dateTimeSchema,
    type: z.enum(SHIFT_TYPES).default('DAY'),
    status: z.enum(SHIFT_STATUSES).default('SCHEDULED'),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), {
    message: 'La fin de garde doit être postérieure au début',
    path: ['endAt'],
  });
export type CreateShiftInput = z.infer<typeof createShiftSchema>;

export const updateShiftSchema = z.object({
  doctorId: idSchema.optional(),
  departmentId: idSchema.optional(),
  startAt: dateTimeSchema.optional(),
  endAt: dateTimeSchema.optional(),
  type: z.enum(SHIFT_TYPES).optional(),
  status: z.enum(SHIFT_STATUSES).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

export const shiftCalendarQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  departmentId: idSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* Téléconsultations                                                           */
/* -------------------------------------------------------------------------- */

export const meetingRequestSchema = z.object({
  doctorId: idSchema,
  reason: z.string().trim().min(5, 'Merci de préciser le motif').max(500),
  preferredAt: dateTimeSchema,
  duration: z.coerce.number().int().min(15).max(120).default(30),
});
export type MeetingRequestInput = z.infer<typeof meetingRequestSchema>;

export const meetingRejectSchema = z.object({
  reason: z.string().trim().min(3, 'Motif de refus requis').max(500),
});

export const meetingQuerySchema = listQuerySchema.extend({
  status: z.enum(MEETING_STATUSES).optional(),
  patientId: idSchema.optional(),
  doctorId: idSchema.optional(),
});

export const meetingSignatureQuerySchema = z.object({
  role: z.coerce.number().int().min(0).max(1).default(0),
});

/* -------------------------------------------------------------------------- */
/* Laboratoire                                                                 */
/* -------------------------------------------------------------------------- */

export const createLabRequestSchema = z.object({
  patientId: idSchema,
  doctorId: idSchema,
  labTestId: idSchema,
  notes: z.string().trim().max(500).optional(),
});

export const updateLabRequestSchema = z.object({
  status: z.enum(LAB_REQUEST_STATUSES).optional(),
  resultText: z.string().trim().max(5000).optional(),
});

/* -------------------------------------------------------------------------- */
/* Audit, notifications, rapports                                              */
/* -------------------------------------------------------------------------- */

export const auditQuerySchema = paginationSchema.extend({
  userId: idSchema.optional(),
  resource: z.string().trim().max(50).optional(),
  action: z.string().trim().max(50).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const notificationQuerySchema = paginationSchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

export const reportRangeSchema = z.object({
  from: dateSchema,
  to: dateSchema,
});

export const markReadSchema = z.object({
  ids: z.array(idSchema).optional(),
  all: z.boolean().optional(),
});

/* -------------------------------------------------------------------------- */
/* Paramètres clinique                                                         */
/* -------------------------------------------------------------------------- */

export const clinicSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.union([emailSchema, z.literal('')]).optional(),
  currency: z.string().trim().length(3).optional(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
  logoUrl: z.string().trim().max(500).optional(),
  zoomAccountId: z.string().trim().max(120).optional(),
  zoomClientId: z.string().trim().max(120).optional(),
  zoomClientSecret: z.string().trim().max(120).optional(),
});
export type ClinicSettingsInput = z.infer<typeof clinicSettingsSchema>;

/* -------------------------------------------------------------------------- */
/* Exports de commodité                                                        */
/* -------------------------------------------------------------------------- */

export const schemas = {
  login: loginSchema,
  registerPatient: registerPatientSchema,
  createUser: createUserSchema,
  createPatient: createPatientSchema,
  createAppointment: createAppointmentSchema,
  publicBooking: publicBookingSchema,
  createConsultation: createConsultationSchema,
  createPrescription: createPrescriptionSchema,
  createMedication: createMedicationSchema,
  adjustStock: adjustStockSchema,
  createInvoice: createInvoiceSchema,
  createPayment: createPaymentSchema,
  createShift: createShiftSchema,
  meetingRequest: meetingRequestSchema,
  auditQuery: auditQuerySchema,
} as const;

export type NotificationPreference = (typeof NOTIFICATION_TYPES)[number];
