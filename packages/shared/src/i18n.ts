/**
 * Internationalisation partagée (français / anglais / malgache).
 *
 * Ce module est la source de vérité des libellés « métier » (rôles, statuts,
 * actions de permissions…) utilisés à la fois par le front et par l'API. Les
 * tableaux historiques `*_LABELS_FR` restent disponibles pour la compatibilité.
 */

import {
  APPOINTMENT_STATUS_LABELS_FR,
  APPOINTMENT_TYPE_LABELS_FR,
  GENDER_LABELS_FR,
  INVOICE_STATUS_LABELS_FR,
  LAB_REQUEST_STATUS_LABELS_FR,
  MEETING_STATUS_LABELS_FR,
  PERMISSION_ACTION_LABELS_FR,
  PERMISSION_RESOURCE_LABELS_FR,
  PAYMENT_METHOD_LABELS_FR,
  PRESCRIPTION_STATUS_LABELS_FR,
  ROLE_LABELS_FR,
  SHIFT_STATUS_LABELS_FR,
  SHIFT_TYPE_LABELS_FR,
} from './constants';

export const SUPPORTED_LOCALES = ['fr', 'en', 'mg'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  mg: 'Malagasy',
};

/** Correspondance locale → identifiant `Intl`. */
export const INTL_LOCALES: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  mg: 'mg-MG',
};

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'fr' || value === 'en' || value === 'mg';
}

/** Catégories de libellés exposées aux composants. */
export interface LabelTables {
  roles: Record<string, string>;
  genders: Record<string, string>;
  appointmentStatus: Record<string, string>;
  appointmentType: Record<string, string>;
  invoiceStatus: Record<string, string>;
  paymentMethod: Record<string, string>;
  prescriptionStatus: Record<string, string>;
  shiftStatus: Record<string, string>;
  shiftType: Record<string, string>;
  meetingStatus: Record<string, string>;
  labStatus: Record<string, string>;
  permissionAction: Record<string, string>;
  permissionResource: Record<string, string>;
  auditAction: Record<string, string>;
  age: string;
}

const FR: LabelTables = {
  roles: ROLE_LABELS_FR,
  genders: GENDER_LABELS_FR,
  appointmentStatus: APPOINTMENT_STATUS_LABELS_FR,
  appointmentType: APPOINTMENT_TYPE_LABELS_FR,
  invoiceStatus: INVOICE_STATUS_LABELS_FR,
  paymentMethod: PAYMENT_METHOD_LABELS_FR,
  prescriptionStatus: PRESCRIPTION_STATUS_LABELS_FR,
  shiftStatus: SHIFT_STATUS_LABELS_FR,
  shiftType: SHIFT_TYPE_LABELS_FR,
  meetingStatus: MEETING_STATUS_LABELS_FR,
  labStatus: LAB_REQUEST_STATUS_LABELS_FR,
  permissionAction: PERMISSION_ACTION_LABELS_FR,
  permissionResource: PERMISSION_RESOURCE_LABELS_FR,
  auditAction: {
    LOGIN_SUCCESS: 'Connexion réussie',
    LOGIN_FAILED: 'Échec de connexion',
    LOGOUT: 'Déconnexion',
    CREATE: 'Création',
    UPDATE: 'Modification',
    DELETE: 'Suppression',
    APPROVE: 'Approbation',
    REJECT: 'Rejet',
    DISPENSE: 'Dispensation',
    STOCK_ADJUST: 'Ajustement de stock',
    PDF_ACCESS: 'Consultation PDF',
    PASSWORD_RESET: 'Réinitialisation du mot de passe',
  },
  age: 'ans',
};

const EN: LabelTables = {
  roles: {
    SUPER_ADMIN: 'Super administrator',
    ADMIN: 'Administrator',
    DOCTOR: 'Doctor',
    NURSE: 'Nurse',
    PHARMACIST: 'Pharmacist',
    RECEPTIONIST: 'Receptionist',
    ACCOUNTANT: 'Accountant',
    NEWS_EDITOR: 'News editor',
    PATIENT: 'Patient',
  },
  genders: { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' },
  appointmentStatus: {
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    CHECKED_IN: 'Checked in',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    NO_SHOW: 'No show',
  },
  appointmentType: { IN_PERSON: 'In person', TELEMEDICINE: 'Teleconsultation' },
  invoiceStatus: { DRAFT: 'Draft', ISSUED: 'Issued', PAID: 'Paid', OVERDUE: 'Overdue', CANCELLED: 'Cancelled' },
  paymentMethod: { CASH: 'Cash', CARD: 'Card', BANK_TRANSFER: 'Bank transfer', CHECK: 'Cheque', MOBILE: 'Mobile payment' },
  prescriptionStatus: { ISSUED: 'Issued', DISPENSED: 'Dispensed', CANCELLED: 'Cancelled' },
  shiftStatus: { PLANNED: 'Planned', ONGOING: 'Ongoing', COMPLETED: 'Completed', CANCELLED: 'Cancelled' },
  shiftType: { DAY: 'Day shift', NIGHT: 'Night shift', ON_CALL: 'On call', WEEKEND: 'Weekend' },
  meetingStatus: { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled', COMPLETED: 'Completed' },
  labStatus: { PENDING: 'Pending', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled' },
  permissionAction: {
    create: 'Create', read: 'View', update: 'Edit', delete: 'Delete', manage: 'Manage',
  },
  permissionResource: {
    patient: 'Patients', doctor: 'Doctors', specialty: 'Specialties', department: 'Departments',
    appointment: 'Appointments', consultation: 'Consultations', prescription: 'Prescriptions',
    medication: 'Medications', stock: 'Stock', invoice: 'Invoices', payment: 'Payments',
    shift: 'Shifts', meeting: 'Teleconsultations', lab: 'Laboratory', audit: 'Audit log',
    role: 'Roles', user: 'Users', dashboard: 'Dashboard', report: 'Reports',
    notification: 'Notifications', settings: 'Settings', news: 'News',
  },
  auditAction: {
    LOGIN_SUCCESS: 'Successful login', LOGIN_FAILED: 'Failed login', LOGOUT: 'Logout',
    CREATE: 'Creation', UPDATE: 'Update', DELETE: 'Deletion', APPROVE: 'Approval',
    REJECT: 'Rejection', DISPENSE: 'Dispensation', STOCK_ADJUST: 'Stock adjustment',
    PDF_ACCESS: 'PDF access', PASSWORD_RESET: 'Password reset',
  },
  age: 'years old',
};

const MG: LabelTables = {
  roles: {
    SUPER_ADMIN: 'Super mpitantana',
    ADMIN: 'Mpitantana',
    DOCTOR: 'Dokotera',
    NURSE: 'Mpitsabo mpanampy',
    PHARMACIST: 'Apoteker',
    RECEPTIONIST: 'Mpandray vahiny',
    ACCOUNTANT: 'Mpanao kaonty',
    NEWS_EDITOR: 'Mpanoratra vaovao',
    PATIENT: 'Marary',
  },
  genders: { MALE: 'Lahy', FEMALE: 'Vavy', OTHER: 'Hafa' },
  appointmentStatus: {
    PENDING: 'Miandry', CONFIRMED: 'Voamarina', CHECKED_IN: 'Efa tonga',
    IN_PROGRESS: 'Ongoing', COMPLETED: 'Vita', CANCELLED: 'Foana', NO_SHOW: 'Tsy tonga',
  },
  appointmentType: { IN_PERSON: 'Mivantana', TELEMEDICINE: 'Fihaonana an-telefaona' },
  invoiceStatus: {
    DRAFT: 'Drafy', ISSUED: 'Navoaka', PAID: 'Voaloa', OVERDUE: 'Tara', CANCELLED: 'Foana',
  },
  paymentMethod: {
    CASH: 'Volan-tanana', CARD: 'Karatra', BANK_TRANSFER: 'Famindrana banky',
    CHECK: 'Seque', MOBILE: 'Fandoavana finday',
  },
  prescriptionStatus: { ISSUED: 'Navoaka', DISPENSED: 'Nomena', CANCELLED: 'Foana' },
  shiftStatus: { PLANNED: 'Nomanina', ONGOING: 'Ongoing', COMPLETED: 'Vita', CANCELLED: 'Foana' },
  shiftType: { DAY: 'Andro', NIGHT: 'Alina', ON_CALL: 'Miandry antso', WEEKEND: 'Faran’ny herinandro' },
  meetingStatus: {
    PENDING: 'Miandry', APPROVED: 'Nekena', REJECTED: 'Nolavina',
    CANCELLED: 'Foana', COMPLETED: 'Vita',
  },
  labStatus: { PENDING: 'Miandry', IN_PROGRESS: 'Ongoing', COMPLETED: 'Vita', CANCELLED: 'Foana' },
  permissionAction: {
    create: 'Mamorona', read: 'Mijery', update: 'Manova', delete: 'Mamafa', manage: 'Mitantana',
  },
  permissionResource: {
    patient: 'Marary', doctor: 'Dokotera', specialty: 'Manampahaizana', department: 'Sampana',
    appointment: 'Fihaonana', consultation: 'Fizahana', prescription: 'Ordonansa',
    medication: 'Fanafody', stock: 'Fitehirizana', invoice: 'Faktiora', payment: 'Fandoavana',
    shift: 'Fihodinana', meeting: 'Fihaonana lavitra', lab: 'Laboratoara', audit: 'Diary',
    role: 'Andraikitra', user: 'Mpampiasa', dashboard: 'Solaitrabe', report: 'Tatitra',
    notification: 'Fampahafantarana', settings: 'Fikirana', news: 'Vaovao',
  },
  auditAction: {
    LOGIN_SUCCESS: 'Fidirana nahomby', LOGIN_FAILED: 'Fidirana tsy nahomby', LOGOUT: 'Fivoahana',
    CREATE: 'Famoronana', UPDATE: 'Fanavaozana', DELETE: 'Famafana', APPROVE: 'Fankatoavana',
    REJECT: 'Fandavana', DISPENSE: 'Fananterana', STOCK_ADJUST: 'Fanitsiana tahiry',
    PDF_ACCESS: 'Fidirana PDF', PASSWORD_RESET: 'Famerenana tenimiafina',
  },
  age: 'taona',
};

const TABLES: Record<Locale, LabelTables> = { fr: FR, en: EN, mg: MG };

let currentLocale: Locale = 'fr';

/**
 * Définit la locale utilisée par les formateurs partagés.
 *
 * Les constantes historiques `*_LABELS_FR` sont mutées sur place pour rester
 * compatibles avec les composants qui les consomment directement : elles
 * reflètent ainsi toujours la langue courante.
 */
export function setSharedLocale(locale: Locale): void {
  currentLocale = locale;
  const table = TABLES[locale];
  Object.assign(ROLE_LABELS_FR, table.roles);
  Object.assign(GENDER_LABELS_FR, table.genders);
  Object.assign(APPOINTMENT_STATUS_LABELS_FR, table.appointmentStatus);
  Object.assign(APPOINTMENT_TYPE_LABELS_FR, table.appointmentType);
  Object.assign(INVOICE_STATUS_LABELS_FR, table.invoiceStatus);
  Object.assign(PAYMENT_METHOD_LABELS_FR, table.paymentMethod);
  Object.assign(PRESCRIPTION_STATUS_LABELS_FR, table.prescriptionStatus);
  Object.assign(SHIFT_STATUS_LABELS_FR, table.shiftStatus);
  Object.assign(SHIFT_TYPE_LABELS_FR, table.shiftType);
  Object.assign(MEETING_STATUS_LABELS_FR, table.meetingStatus);
  Object.assign(LAB_REQUEST_STATUS_LABELS_FR, table.labStatus);
  Object.assign(PERMISSION_ACTION_LABELS_FR, table.permissionAction);
  Object.assign(PERMISSION_RESOURCE_LABELS_FR, table.permissionResource);
}

export function getSharedLocale(): Locale {
  return currentLocale;
}

/** Table de libellés pour la locale courante. */
export function labelsFor(): LabelTables {
  return TABLES[currentLocale];
}

/** Libellé métier pour la locale courante, avec repli sur le code. */
export function localizedLabel(
  category: keyof Omit<LabelTables, 'age'>,
  code: string | undefined | null,
): string {
  if (!code) return '—';
  return TABLES[currentLocale][category][code] ?? FR[category][code] ?? code;
}

/** Libellé de rôle pour la locale courante. */
export function localizedRoleLabel(code: string | undefined | null): string {
  return localizedLabel('roles', code);
}
