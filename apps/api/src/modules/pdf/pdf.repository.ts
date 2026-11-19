/**
 * Chargement des données nécessaires aux documents PDF.
 *
 * Chaque méthode regroupe en une seule requête tout ce qu'un document affiche,
 * afin d'éviter les allers-retours en boucle. Les identifiants de patient et de
 * médecin sont renvoyés pour permettre le contrôle d'accès du contrôleur.
 */

import { query, queryOne, type Row } from '../../config/db.js';
import { AppError } from '../../utils/app-error.js';

/* -------------------------------------------------------------------------- */
/* Interfaces de lignes                                                        */
/* -------------------------------------------------------------------------- */

export interface PatientRow extends Row {
  id: number;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  blood_group: string | null;
  allergies: string | null;
  medical_history: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  insurance_number: string | null;
  created_at: string;
}

const PATIENT_COLUMNS = `
  p.id, p.first_name, p.last_name, p.birth_date, p.gender, p.address, p.city, p.postal_code,
  p.phone, p.email, p.blood_group, p.allergies, p.medical_history,
  p.emergency_contact_name, p.emergency_contact_phone, p.insurance_number, p.created_at
`;

export async function findPatient(id: number): Promise<PatientRow | null> {
  return queryOne<PatientRow>(`SELECT ${PATIENT_COLUMNS} FROM patients p WHERE p.id = ?`, [id]);
}

/* -------------------------------------------------------------------------- */
/* Dossier patient                                                             */
/* -------------------------------------------------------------------------- */

export async function findPatientAppointments(patientId: number): Promise<Row[]> {
  return query<Row>(
    `SELECT a.id, a.scheduled_at, a.status, a.reason, a.doctor_id,
            CONCAT('Dr ', u.first_name, ' ', u.last_name) AS doctor_name
     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     JOIN users u   ON u.id = d.user_id
     WHERE a.patient_id = ?
     ORDER BY a.scheduled_at DESC
     LIMIT 200`,
    [patientId],
  );
}

export async function findPatientConsultations(patientId: number): Promise<Row[]> {
  return query<Row>(
    `SELECT c.id, c.diagnosis, c.notes, c.follow_up_at, c.created_at, c.doctor_id,
            CONCAT('Dr ', u.first_name, ' ', u.last_name) AS doctor_name
     FROM consultations c
     JOIN appointments a ON a.id = c.appointment_id
     JOIN doctors d      ON d.id = c.doctor_id
     JOIN users u        ON u.id = d.user_id
     WHERE a.patient_id = ?
     ORDER BY c.created_at DESC
     LIMIT 200`,
    [patientId],
  );
}

export async function findPatientPrescriptions(patientId: number): Promise<Row[]> {
  const prescriptions = await query<Row & { id: number }>(
    `SELECT pr.id, pr.issued_at, pr.status, pr.doctor_id,
            CONCAT('Dr ', u.first_name, ' ', u.last_name) AS doctor_name
     FROM prescriptions pr
     JOIN consultations c ON c.id = pr.consultation_id
     JOIN appointments a  ON a.id = c.appointment_id
     JOIN doctors d       ON d.id = pr.doctor_id
     JOIN users u         ON u.id = d.user_id
     WHERE a.patient_id = ?
     ORDER BY pr.issued_at DESC
     LIMIT 100`,
    [patientId],
  );

  if (prescriptions.length === 0) return [];

  const ids = prescriptions.map((row) => row.id);
  const items = await query<Row>(
    `SELECT pi.prescription_id, pi.quantity, m.name AS medication_name
     FROM prescription_items pi
     JOIN medications m ON m.id = pi.medication_id
     WHERE pi.prescription_id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  );

  return prescriptions.map((prescription) => ({
    ...prescription,
    items: items.filter((item) => item.prescription_id === prescription.id),
  }));
}

export async function findPatientInvoices(patientId: number): Promise<Row[]> {
  return query<Row>(
    `SELECT id, number, issued_at, total_amount, paid_amount, status
     FROM invoices
     WHERE patient_id = ?
     ORDER BY issued_at DESC
     LIMIT 200`,
    [patientId],
  );
}

/* -------------------------------------------------------------------------- */
/* Ordonnance                                                                  */
/* -------------------------------------------------------------------------- */

export interface PrescriptionHeaderRow extends Row {
  id: number;
  issued_at: string;
  status: string;
  doctor_id: number;
  doctor_name: string;
  specialty_name: string;
  license_number: string;
  patient_id: number;
}

export async function findPrescriptionHeader(id: number): Promise<PrescriptionHeaderRow | null> {
  return queryOne<PrescriptionHeaderRow>(
    `SELECT pr.id, pr.issued_at, pr.status, pr.doctor_id, a.patient_id,
            CONCAT('Dr ', u.first_name, ' ', u.last_name) AS doctor_name,
            s.name AS specialty_name, d.license_number
     FROM prescriptions pr
     JOIN consultations c ON c.id = pr.consultation_id
     JOIN appointments a  ON a.id = c.appointment_id
     JOIN doctors d       ON d.id = pr.doctor_id
     JOIN users u         ON u.id = d.user_id
     JOIN specialties s   ON s.id = d.specialty_id
     WHERE pr.id = ?`,
    [id],
  );
}

export async function findPrescriptionItems(prescriptionId: number): Promise<Row[]> {
  return query<Row>(
    `SELECT pi.medication_id, m.name AS medication_name, m.unit,
            pi.dosage, pi.frequency, pi.duration, pi.instructions, pi.quantity
     FROM prescription_items pi
     JOIN medications m ON m.id = pi.medication_id
     WHERE pi.prescription_id = ?
     ORDER BY pi.id ASC`,
    [prescriptionId],
  );
}

/* -------------------------------------------------------------------------- */
/* Consultation                                                                */
/* -------------------------------------------------------------------------- */

export interface ConsultationHeaderRow extends Row {
  id: number;
  appointment_id: number;
  doctor_id: number;
  doctor_name: string;
  patient_id: number;
  diagnosis: string;
  notes: string | null;
  follow_up_at: string | null;
  created_at: string;
}

export async function findConsultationHeader(id: number): Promise<ConsultationHeaderRow | null> {
  return queryOne<ConsultationHeaderRow>(
    `SELECT c.id, c.appointment_id, c.doctor_id, a.patient_id,
            c.diagnosis, c.notes, c.follow_up_at, c.created_at,
            CONCAT('Dr ', u.first_name, ' ', u.last_name) AS doctor_name
     FROM consultations c
     JOIN appointments a ON a.id = c.appointment_id
     JOIN doctors d      ON d.id = c.doctor_id
     JOIN users u        ON u.id = d.user_id
     WHERE c.id = ?`,
    [id],
  );
}

export async function findConsultationPrescriptions(consultationId: number): Promise<Row[]> {
  const prescriptions = await query<Row & { id: number }>(
    `SELECT id, issued_at, status FROM prescriptions WHERE consultation_id = ? ORDER BY id ASC`,
    [consultationId],
  );

  if (prescriptions.length === 0) return [];

  const ids = prescriptions.map((row) => row.id);
  const items = await query<Row>(
    `SELECT pi.prescription_id, pi.quantity, m.name AS medication_name
     FROM prescription_items pi
     JOIN medications m ON m.id = pi.medication_id
     WHERE pi.prescription_id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  );

  return prescriptions.map((prescription) => ({
    ...prescription,
    items: items.filter((item) => item.prescription_id === prescription.id),
  }));
}

/* -------------------------------------------------------------------------- */
/* Facture                                                                     */
/* -------------------------------------------------------------------------- */

export interface InvoiceHeaderRow extends Row {
  id: number;
  number: string;
  patient_id: number;
  issued_at: string;
  due_date: string;
  status: string;
  paid_amount: string;
  vat_rate: string;
}

export async function findInvoiceHeader(id: number): Promise<InvoiceHeaderRow | null> {
  return queryOne<InvoiceHeaderRow>(
    `SELECT id, number, patient_id, issued_at, due_date, status, paid_amount, vat_rate
     FROM invoices WHERE id = ?`,
    [id],
  );
}

export async function findInvoiceItems(invoiceId: number): Promise<Row[]> {
  return query<Row>(
    'SELECT label, quantity, unit_price, line_total FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC',
    [invoiceId],
  );
}

export async function findInvoicePayments(invoiceId: number): Promise<Row[]> {
  return query<Row>(
    'SELECT amount, method, paid_at, reference FROM payments WHERE invoice_id = ? ORDER BY paid_at ASC',
    [invoiceId],
  );
}

/* -------------------------------------------------------------------------- */
/* Planning des gardes                                                         */
/* -------------------------------------------------------------------------- */

export async function findShiftPlanning(from: string, to: string): Promise<Row[]> {
  return query<Row>(
    `SELECT shift_date, doctor_name, department_name, start_time, end_time, hours, type, status
     FROM v_shift_calendar
     WHERE shift_date BETWEEN ? AND ?
     ORDER BY start_at ASC`,
    [from, to],
  );
}

export async function findShiftSummary(from: string, to: string): Promise<Row[]> {
  return query<Row>(
    `SELECT doctor_name, COUNT(*) AS shift_count, ROUND(SUM(hours), 1) AS total_hours
     FROM v_shift_calendar
     WHERE shift_date BETWEEN ? AND ?
     GROUP BY doctor_id, doctor_name
     ORDER BY total_hours DESC`,
    [from, to],
  );
}

/* -------------------------------------------------------------------------- */
/* Contrôle d'existence                                                        */
/* -------------------------------------------------------------------------- */

/** Vérifie qu'une ressource existe, sinon lève une 404. */
export async function assertPatientExists(id: number): Promise<PatientRow> {
  const patient = await findPatient(id);
  if (!patient) throw AppError.notFound('Patient introuvable.', 'PATIENT_NOT_FOUND');
  return patient;
}
