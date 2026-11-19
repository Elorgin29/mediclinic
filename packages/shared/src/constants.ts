/**
 * Constantes partagées entre le front et le back.
 * Toute valeur énumérée en base doit être déclarée ici.
 */

export const APP_NAME = 'MediClinic';

/** Rôles prédéfinis (les rôles restent modulaires en base). */
export const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'PHARMACIST',
  'RECEPTIONIST',
  'ACCOUNTANT',
  'PATIENT',
] as const;
export type RoleCode = (typeof ROLES)[number];

/** Rôles ayant accès au back office. */
export const STAFF_ROLES: RoleCode[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'PHARMACIST',
  'RECEPTIONIST',
  'ACCOUNTANT',
];

export const ROLE_LABELS_FR: Record<RoleCode, string> = {
  SUPER_ADMIN: 'Super administrateur',
  ADMIN: 'Administrateur',
  DOCTOR: 'Médecin',
  NURSE: 'Infirmier(ère)',
  PHARMACIST: 'Pharmacien(ne)',
  RECEPTIONIST: 'Réceptionniste',
  ACCOUNTANT: 'Comptable',
  PATIENT: 'Patient',
};

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABELS_FR: Record<Gender, string> = {
  MALE: 'Homme',
  FEMALE: 'Femme',
  OTHER: 'Autre',
};

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const APPOINTMENT_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const APPOINTMENT_STATUS_LABELS_FR: Record<AppointmentStatus, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmé',
  CHECKED_IN: 'Arrivé',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
  NO_SHOW: 'Absent',
};

export const APPOINTMENT_TYPES = ['IN_PERSON', 'TELEMEDICINE'] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];
export const APPOINTMENT_TYPE_LABELS_FR: Record<AppointmentType, string> = {
  IN_PERSON: 'Présentiel',
  TELEMEDICINE: 'Téléconsultation',
};

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_LABELS_FR: Record<InvoiceStatus, string> = {
  DRAFT: 'Brouillon',
  ISSUED: 'Émise',
  PARTIALLY_PAID: 'Partiellement payée',
  PAID: 'Payée',
  CANCELLED: 'Annulée',
};

export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'INSURANCE', 'CHEQUE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS_FR: Record<PaymentMethod, string> = {
  CASH: 'Espèces',
  CARD: 'Carte bancaire',
  TRANSFER: 'Virement',
  INSURANCE: 'Assurance',
  CHEQUE: 'Chèque',
};

export const STOCK_MOVEMENT_TYPES = ['IN', 'OUT'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const PRESCRIPTION_STATUSES = ['ISSUED', 'DISPENSED', 'CANCELLED'] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];
export const PRESCRIPTION_STATUS_LABELS_FR: Record<PrescriptionStatus, string> = {
  ISSUED: 'Émise',
  DISPENSED: 'Dispensée',
  CANCELLED: 'Annulée',
};

export const SHIFT_TYPES = ['DAY', 'NIGHT', 'ON_CALL'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];
export const SHIFT_TYPE_LABELS_FR: Record<ShiftType, string> = {
  DAY: 'Jour',
  NIGHT: 'Nuit',
  ON_CALL: 'Astreinte',
};

export const SHIFT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];
export const SHIFT_STATUS_LABELS_FR: Record<ShiftStatus, string> = {
  SCHEDULED: 'Planifiée',
  CONFIRMED: 'Confirmée',
  COMPLETED: 'Effectuée',
  CANCELLED: 'Annulée',
};

export const MEETING_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export const MEETING_STATUS_LABELS_FR: Record<MeetingStatus, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  REJECTED: 'Refusée',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
};

export const LAB_REQUEST_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type LabRequestStatus = (typeof LAB_REQUEST_STATUSES)[number];
export const LAB_REQUEST_STATUS_LABELS_FR: Record<LabRequestStatus, string> = {
  PENDING: 'En attente',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Résultat disponible',
  CANCELLED: 'Annulée',
};

export const NOTIFICATION_TYPES = ['INFO', 'SUCCESS', 'WARNING', 'ERROR'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'APPROVE',
  'REJECT',
  'PDF_ACCESS',
  'DISPENSE',
  'STOCK_ADJUST',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Groupes d'actions utilisés par la matrice de permissions. */
export const PERMISSION_ACTIONS = ['create', 'read', 'update', 'delete', 'manage'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_ACTION_LABELS_FR: Record<PermissionAction, string> = {
  create: 'Créer',
  read: 'Consulter',
  update: 'Modifier',
  delete: 'Supprimer',
  manage: 'Gérer',
};

/** Ressources soumises au contrôle d'accès. */
export const PERMISSION_RESOURCES = [
  'patient',
  'doctor',
  'specialty',
  'department',
  'appointment',
  'consultation',
  'prescription',
  'medication',
  'stock',
  'invoice',
  'payment',
  'shift',
  'meeting',
  'lab',
  'audit',
  'role',
  'user',
  'dashboard',
  'report',
  'notification',
  'settings',
] as const;
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const PERMISSION_RESOURCE_LABELS_FR: Record<PermissionResource, string> = {
  patient: 'Patients',
  doctor: 'Médecins',
  specialty: 'Spécialités',
  department: 'Départements',
  appointment: 'Rendez-vous',
  consultation: 'Consultations',
  prescription: 'Ordonnances',
  medication: 'Médicaments',
  stock: 'Stock',
  invoice: 'Factures',
  payment: 'Paiements',
  shift: 'Gardes',
  meeting: 'Téléconsultations',
  lab: 'Laboratoire',
  audit: 'Journal d’audit',
  role: 'Rôles',
  user: 'Utilisateurs',
  dashboard: 'Tableau de bord',
  report: 'Rapports',
  notification: 'Notifications',
  settings: 'Paramètres',
};

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

export const DEFAULT_CURRENCY = 'EUR';
export const DEFAULT_VAT_RATE = 20;
/** Seuil en jours avant expiration d'un médicament déclenchant une alerte. */
export const EXPIRY_WARNING_DAYS = 30;
/** Fenêtre (minutes) avant le début d'un meeting pendant laquelle on peut rejoindre. */
export const MEETING_JOIN_WINDOW_MINUTES = 10;

export const PASSWORD_MIN_LENGTH = 8;

/** Chemin des assets publics côté API (logo des PDF). */
export const API_PUBLIC_PREFIX = '/static';
