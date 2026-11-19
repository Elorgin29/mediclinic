/**
 * Assemblage des documents PDF.
 *
 * Le service fait le lien entre les lignes SQL (brutes) et les structures
 * attendues par `utils/pdf.generator.ts` : conversion des types, calculs
 * dérivés, dénomination des fichiers.
 *
 * Chaque méthode renvoie le PDF et le nom de fichier à utiliser.
 */

import type { Appointment, Consultation, Invoice, InvoiceItem, Patient, Prescription } from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import {
  generateConsultationReportPdf,
  generateDispensationSlipPdf,
  generateInvoicePdf,
  generatePatientRecordPdf,
  generatePrescriptionPdf,
  generateShiftPlanningPdf,
} from '../../utils/pdf.generator.js';
import * as repository from './pdf.repository.js';

/** Document généré : contenu binaire et nom de fichier proposé. */
export interface GeneratedDocument {
  buffer: Buffer;
  filename: string;
}

/** Construit un `Patient` exploitable par le générateur à partir d'une ligne. */
function toPatient(row: repository.PatientRow): Patient {
  return {
    id: row.id,
    user_id: null,
    first_name: row.first_name,
    last_name: row.last_name,
    birth_date: row.birth_date,
    gender: row.gender as Patient['gender'],
    address: row.address,
    city: row.city,
    postal_code: row.postal_code,
    phone: row.phone,
    email: row.email,
    blood_group: row.blood_group as Patient['blood_group'],
    allergies: row.allergies,
    medical_history: row.medical_history,
    emergency_contact_name: row.emergency_contact_name,
    emergency_contact_phone: row.emergency_contact_phone,
    insurance_number: row.insurance_number,
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

/** Normalise une date MySQL en chaîne lisible (le générateur formate ensuite). */
function asString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/* -------------------------------------------------------------------------- */
/* Dossier patient                                                             */
/* -------------------------------------------------------------------------- */

export async function patientRecord(patientId: number, generatedBy: string): Promise<GeneratedDocument> {
  const patient = await repository.assertPatientExists(patientId);

  const [appointments, consultations, prescriptions, invoices] = await Promise.all([
    repository.findPatientAppointments(patientId),
    repository.findPatientConsultations(patientId),
    repository.findPatientPrescriptions(patientId),
    repository.findPatientInvoices(patientId),
  ]);

  const buffer = await generatePatientRecordPdf({
    patient: toPatient(patient),
    // Les lignes SQL sont partielles : le générateur ne lit que les champs
    // qu'il affiche, la conversion est donc volontairement souple.
    appointments: appointments.map(
      (row) =>
        ({
          scheduled_at: asString(row.scheduled_at),
          doctor_name: asString(row.doctor_name),
          reason: row.reason === null ? null : asString(row.reason),
          status: asString(row.status),
        }) as unknown as Appointment,
    ),
    consultations: consultations.map(
      (row) =>
        ({
          created_at: asString(row.created_at),
          doctor_name: asString(row.doctor_name),
          diagnosis: asString(row.diagnosis),
          notes: row.notes === null ? null : asString(row.notes),
          follow_up_at: row.follow_up_at === null ? null : asString(row.follow_up_at),
        }) as unknown as Consultation,
    ),
    prescriptions: prescriptions.map(
      (row) =>
        ({
          id: row.id,
          issued_at: asString(row.issued_at),
          status: asString(row.status),
          items: Array.isArray(row.items) ? row.items : [],
        }) as unknown as Prescription,
    ),
    invoices: invoices.map(
      (row) =>
        ({
          number: asString(row.number),
          issued_at: asString(row.issued_at),
          total_amount: asString(row.total_amount),
          paid_amount: asString(row.paid_amount),
          status: asString(row.status),
        }) as unknown as Invoice,
    ),
    generatedBy,
  });

  return {
    buffer,
    filename: `dossier-patient-${patientId}.pdf`,
  };
}

/* -------------------------------------------------------------------------- */
/* Ordonnance                                                                  */
/* -------------------------------------------------------------------------- */

export async function prescriptionDocument(
  prescriptionId: number,
  generatedBy: string,
  withDispensationLayout = false,
): Promise<GeneratedDocument> {
  const header = await repository.findPrescriptionHeader(prescriptionId);
  if (!header) throw AppError.notFound('Ordonnance introuvable.', 'PRESCRIPTION_NOT_FOUND');

  const patient = await repository.assertPatientExists(header.patient_id);
  const items = await repository.findPrescriptionItems(prescriptionId);

  if (withDispensationLayout) {
    const buffer = await generateDispensationSlipPdf({
      prescription: {
        id: header.id,
        issued_at: header.issued_at,
        status: header.status,
        doctor_name: header.doctor_name,
        license_number: header.license_number,
        items: items.map((item) => ({
          medication_name: asString(item.medication_name),
          unit: asString(item.unit),
          quantity: Number(item.quantity),
          dosage: asString(item.dosage),
          duration: asString(item.duration),
          instructions: item.instructions === null ? null : asString(item.instructions),
        })),
        patient: toPatient(patient),
      } as never,
      generatedBy,
    });

    return { buffer, filename: `bon-dispensation-${prescriptionId}.pdf` };
  }

  const buffer = await generatePrescriptionPdf({
    prescription: {
      id: header.id,
      issued_at: header.issued_at,
      status: header.status,
      doctor_name: header.doctor_name,
      specialty_name: header.specialty_name,
      license_number: header.license_number,
      items: items.map((item) => ({
        medication_name: asString(item.medication_name),
        unit: asString(item.unit),
        quantity: Number(item.quantity),
        dosage: asString(item.dosage),
        frequency: asString(item.frequency),
        duration: asString(item.duration),
        instructions: item.instructions === null ? null : asString(item.instructions),
      })),
      patient: toPatient(patient),
    } as never,
    generatedBy,
  });

  return { buffer, filename: `ordonnance-${prescriptionId}.pdf` };
}

/* -------------------------------------------------------------------------- */
/* Consultation                                                                */
/* -------------------------------------------------------------------------- */

export async function consultationReport(
  consultationId: number,
  generatedBy: string,
): Promise<GeneratedDocument> {
  const header = await repository.findConsultationHeader(consultationId);
  if (!header) throw AppError.notFound('Consultation introuvable.', 'CONSULTATION_NOT_FOUND');

  const patient = await repository.assertPatientExists(header.patient_id);
  const prescriptions = await repository.findConsultationPrescriptions(consultationId);

  const buffer = await generateConsultationReportPdf({
    consultation: {
      id: header.id,
      appointment_id: header.appointment_id,
      doctor_id: header.doctor_id,
      doctor_name: header.doctor_name,
      diagnosis: header.diagnosis,
      notes: header.notes,
      follow_up_at: header.follow_up_at,
      created_at: header.created_at,
    } as unknown as Consultation,
    patient: toPatient(patient),
    prescriptions: prescriptions.map(
      (row) =>
        ({
          id: row.id,
          issued_at: asString(row.issued_at),
          status: asString(row.status),
          items: Array.isArray(row.items) ? row.items : [],
        }) as unknown as Prescription,
    ),
    generatedBy,
  });

  return { buffer, filename: `consultation-${consultationId}.pdf` };
}

/* -------------------------------------------------------------------------- */
/* Facture                                                                     */
/* -------------------------------------------------------------------------- */

/** Données de facture attendues par le générateur (lignes complètes). */
export type InvoicePdfData = Omit<Invoice, 'items'> & { items: InvoiceItem[] };

export async function invoiceDocument(invoiceId: number, generatedBy: string): Promise<GeneratedDocument> {
  const header = await repository.findInvoiceHeader(invoiceId);
  if (!header) throw AppError.notFound('Facture introuvable.', 'INVOICE_NOT_FOUND');

  const patient = await repository.assertPatientExists(header.patient_id);
  const [items, payments] = await Promise.all([
    repository.findInvoiceItems(invoiceId),
    repository.findInvoicePayments(invoiceId),
  ]);

  const invoice: InvoicePdfData = {
    id: header.id,
    number: header.number,
    patient_id: header.patient_id,
    patient_name: `${patient.first_name} ${patient.last_name}`,
    consultation_id: null,
    vat_rate: header.vat_rate,
    total_amount: items.reduce((sum, item) => sum + Number(item.line_total), 0).toFixed(2),
    paid_amount: header.paid_amount,
    status: header.status as Invoice['status'],
    issued_at: header.issued_at,
    due_date: header.due_date,
    created_at: header.issued_at,
    items: items.map((item) => ({
      id: 0,
      invoice_id: header.id,
      label: asString(item.label),
      quantity: Number(item.quantity),
      unit_price: asString(item.unit_price),
      line_total: asString(item.line_total),
    })),
  };

  const buffer = await generateInvoicePdf({
    invoice,
    patient: toPatient(patient),
    payments: payments.map((row) => ({
      amount: asString(row.amount),
      method: asString(row.method),
      paid_at: asString(row.paid_at),
      reference: row.reference === null ? null : asString(row.reference),
    })),
    generatedBy,
  });

  return { buffer, filename: `facture-${header.number}.pdf` };
}

/* -------------------------------------------------------------------------- */
/* Planning des gardes                                                         */
/* -------------------------------------------------------------------------- */

export async function shiftPlanning(
  from: string,
  to: string,
  generatedBy: string,
): Promise<GeneratedDocument> {
  const [entries, summary] = await Promise.all([
    repository.findShiftPlanning(from, to),
    repository.findShiftSummary(from, to),
  ]);

  const buffer = await generateShiftPlanningPdf({
    from,
    to,
    entries: entries.map((row) => ({
      shift_date: asString(row.shift_date),
      doctor_name: asString(row.doctor_name),
      department_name: asString(row.department_name),
      start_time: asString(row.start_time),
      end_time: asString(row.end_time),
      hours: Number(row.hours ?? 0),
      type: asString(row.type),
      status: asString(row.status),
    })),
    summary: summary.map((row) => ({
      doctorName: asString(row.doctor_name),
      shiftCount: Number(row.shift_count ?? 0),
      hours: Number(row.total_hours ?? 0),
    })),
    generatedBy,
  });

  return { buffer, filename: `planning-gardes-${from}.pdf` };
}

/* -------------------------------------------------------------------------- */
/* Contrôle d'accès                                                            */
/* -------------------------------------------------------------------------- */

/** Types de documents acceptés par la route générique `/pdf/:type/:id`. */
export const DOCUMENT_TYPES = [
  'patient',
  'prescription',
  'dispensation',
  'consultation',
  'invoice',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Permission requise par type de document. */
export const DOCUMENT_PERMISSIONS: Record<DocumentType, string> = {
  patient: 'patient:read',
  prescription: 'prescription:read',
  dispensation: 'prescription:read',
  consultation: 'consultation:read',
  invoice: 'invoice:read',
};

/**
 * Identifiant du patient propriétaire du document.
 * Sert au contrôle d'accès : un compte patient ne doit télécharger que ses
 * propres documents.
 */
export async function ownerPatientId(type: DocumentType, id: number): Promise<number | null> {
  switch (type) {
    case 'patient':
      return id;
    case 'prescription':
    case 'dispensation': {
      const header = await repository.findPrescriptionHeader(id);
      return header?.patient_id ?? null;
    }
    case 'consultation': {
      const header = await repository.findConsultationHeader(id);
      return header?.patient_id ?? null;
    }
    case 'invoice': {
      const header = await repository.findInvoiceHeader(id);
      return header?.patient_id ?? null;
    }
    default:
      return null;
  }
}

/** Génère le document demandé par la route générique. */
export async function byType(
  type: DocumentType,
  id: number,
  generatedBy: string,
): Promise<GeneratedDocument> {
  switch (type) {
    case 'patient':
      return patientRecord(id, generatedBy);
    case 'prescription':
      return prescriptionDocument(id, generatedBy, false);
    case 'dispensation':
      return prescriptionDocument(id, generatedBy, true);
    case 'consultation':
      return consultationReport(id, generatedBy);
    case 'invoice':
      return invoiceDocument(id, generatedBy);
  }
}
