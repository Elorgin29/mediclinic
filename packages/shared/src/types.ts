/**
 * Types de domaine partagés entre l'API et l'interface.
 * Les colonnes techniques (created_at, updated_at) sont systématiquement exposées.
 */

import type {
  AppointmentStatus,
  AppointmentType,
  BloodGroup,
  Gender,
  InvoiceStatus,
  MeetingStatus,
  NotificationType,
  PaymentMethod,
  PermissionAction,
  PermissionResource,
  PrescriptionStatus,
  RoleCode,
  ShiftStatus,
  ShiftType,
  StockMovementType,
} from './constants';

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
}

export interface Role {
  id: number;
  code: RoleCode | string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface Permission {
  id: number;
  code: string;
  resource: PermissionResource | string;
  action: PermissionAction | string;
  description: string | null;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  roles: string[];
  permissions: string[];
  patient_id?: number | null;
  doctor_id?: number | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthSession {
  user: User;
  tokens: AuthTokens;
}

export interface Patient {
  id: number;
  user_id: number | null;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: Gender;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  blood_group: BloodGroup | null;
  allergies: string | null;
  medical_history: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  insurance_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface Specialty {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Department {
  id: number;
  name: string;
  description: string | null;
  head_doctor_id: number | null;
  head_doctor_name?: string | null;
  created_at: string;
}

export interface Doctor {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  specialty_id: number;
  specialty_name?: string;
  department_id: number | null;
  department_name?: string | null;
  license_number: string;
  consultation_fee: string;
  bio: string | null;
  is_accepting_patients: boolean;
  created_at: string;
}

export interface DoctorPublic {
  id: number;
  first_name: string;
  last_name: string;
  specialty_name: string;
  department_name: string | null;
  bio: string | null;
  consultation_fee: string;
}

export interface Appointment {
  id: number;
  patient_id: number;
  patient_name?: string;
  doctor_id: number;
  doctor_name?: string;
  department_id: number | null;
  department_name?: string | null;
  scheduled_at: string;
  duration: number;
  status: AppointmentStatus;
  type: AppointmentType;
  reason: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
}

export interface Consultation {
  id: number;
  appointment_id: number;
  doctor_id: number;
  doctor_name?: string;
  patient_id?: number;
  patient_name?: string;
  diagnosis: string;
  notes: string | null;
  follow_up_at: string | null;
  created_at: string;
}

export interface PrescriptionItem {
  id: number;
  prescription_id: number;
  medication_id: number;
  medication_name?: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  quantity: number;
}

export interface Prescription {
  id: number;
  consultation_id: number;
  doctor_id: number;
  doctor_name?: string;
  patient_name?: string;
  issued_at: string;
  status: PrescriptionStatus;
  items: PrescriptionItem[];
}

export interface Medication {
  id: number;
  name: string;
  category: string;
  unit: string;
  price: string;
  stock_quantity: number;
  alert_threshold: number;
  expiry_date: string | null;
  supplier: string | null;
  is_low_stock?: boolean;
  created_at: string;
}

export interface StockMovement {
  id: number;
  medication_id: number;
  medication_name?: string;
  type: StockMovementType;
  quantity: number;
  reason: string;
  user_id: number;
  user_name?: string;
  created_at: string;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  label: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

export interface Payment {
  id: number;
  invoice_id: number;
  amount: string;
  method: PaymentMethod;
  paid_at: string;
  reference: string | null;
  recorded_by: number;
}

export interface Invoice {
  id: number;
  number: string;
  patient_id: number;
  patient_name?: string;
  consultation_id: number | null;
  total_amount: string;
  paid_amount: string;
  vat_rate: string;
  status: InvoiceStatus;
  issued_at: string;
  due_date: string;
  items?: InvoiceItem[];
  payments?: Payment[];
  created_at: string;
}

export interface Shift {
  id: number;
  doctor_id: number;
  doctor_name?: string;
  department_id: number;
  department_name?: string;
  start_at: string;
  end_at: string;
  type: ShiftType;
  status: ShiftStatus;
  notes: string | null;
}

export interface Meeting {
  id: number;
  appointment_id: number | null;
  patient_id: number;
  patient_name?: string;
  doctor_id: number;
  doctor_name?: string;
  reason: string;
  preferred_at: string;
  duration: number;
  zoom_meeting_id: string | null;
  join_url: string | null;
  start_url: string | null;
  password: string | null;
  start_time: string | null;
  status: MeetingStatus;
  rejection_reason: string | null;
  requested_by: number;
  approved_by: number | null;
  created_at: string;
  /** Fenêtre de connexion ouverte (calculé par la vue v_active_meetings). */
  is_joinable?: boolean;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
}

export interface LabTest {
  id: number;
  name: string;
  category: string;
  price: string;
  turnaround_hours: number;
}

export interface LabRequest {
  id: number;
  patient_id: number;
  patient_name?: string;
  doctor_id: number;
  doctor_name?: string;
  lab_test_id: number;
  lab_test_name?: string;
  status: string;
  result_text: string | null;
  requested_at: string;
  completed_at: string | null;
}

export interface DashboardStats {
  patientsTotal: number;
  doctorsTotal: number;
  appointmentsToday: number;
  appointmentsWeek: number;
  appointmentsMonth: number;
  revenueMonth: number;
  revenuePreviousMonth: number;
  revenueChangePercent: number;
  pendingMeetings: number;
  lowStockCount: number;
  shiftsInProgress: number;
}

export interface RevenueByMonthPoint {
  month: string;
  revenue: number;
}

export interface AppointmentsByDepartmentPoint {
  department: string;
  count: number;
}

export interface ConsultationsByDoctorPoint {
  doctor: string;
  count: number;
}

export interface TopMedicationPoint {
  medication: string;
  dispensed: number;
}

export interface LowStockMedication {
  id: number;
  name: string;
  stock_quantity: number;
  alert_threshold: number;
}

export interface ActivityEntry {
  id: number;
  user_name: string | null;
  action: string;
  resource: string;
  created_at: string;
}

export interface DashboardCharts {
  revenueByMonth: RevenueByMonthPoint[];
  appointmentsByDepartment: AppointmentsByDepartmentPoint[];
  consultationsByDoctor: ConsultationsByDoctorPoint[];
  topMedications: TopMedicationPoint[];
  lowStock: LowStockMedication[];
  recentActivity: ActivityEntry[];
}

export interface DashboardPayload {
  stats: DashboardStats;
  charts: DashboardCharts;
}

export interface PatientHistory {
  patient: Patient;
  appointments: Appointment[];
  consultations: Consultation[];
  prescriptions: Prescription[];
  invoices: Invoice[];
}

export interface MeetingSignature {
  signature: string;
  meetingNumber: string;
  password: string;
  userName: string;
  role: 0 | 1;
  sdkKey: string;
}

export interface ShiftCalendarEntry extends Shift {
  doctor_color: string;
  /**
   * Heure de début `HH:MM`, fournie par la vue `v_shift_calendar`.
   * Facultative : le service peut renvoyer des gardes brutes sans passer par la
   * vue, auquel cas le front dérive l'horaire de `start_at`.
   */
  start_time?: string;
  /** Heure de fin `HH:MM` (vue `v_shift_calendar`). */
  end_time?: string;
  /** Durée en heures (vue `v_shift_calendar`). */
  hours?: number;
}

export interface AuditFilters {
  user_id?: number;
  resource?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}
