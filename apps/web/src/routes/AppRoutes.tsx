/**
 * Routage de l'application.
 *
 * Trois espaces distincts, protégés par des gardes différentes :
 *  - public : accueil, annuaire, prise de rendez-vous, demande de téléconsultation ;
 *  - `/admin` : back-office réservé au personnel ;
 *  - `/patient` : espace personnel du patient.
 *
 * Les pages du back-office sont chargées paresseusement (`React.lazy`) : le
 * bundle initial ne contient que le site public et l'authentification, ce qui
 * accélère nettement le premier affichage.
 */

import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from '@/components/layouts/AdminLayout';
import { FullPageLoader } from '@/components/layouts/PageHeader';
import { PatientLayout } from '@/components/layouts/PatientLayout';
import { PublicLayout } from '@/components/layouts/PublicLayout';
import { ProtectedRoute, RedirectIfAuthenticated } from '@/routes/ProtectedRoute';

/* -------------------------------------------------------------------------- */
/* Pages publiques (chargées immédiatement : cœur de l'expérience)             */
/* -------------------------------------------------------------------------- */
import HomePage from '@/pages/public/HomePage';
import DoctorsPage from '@/pages/public/DoctorsPage';
import SpecialtiesPage from '@/pages/public/SpecialtiesPage';
import BookingPage from '@/pages/public/BookingPage';
import TeleconsultationPage from '@/pages/public/TeleconsultationPage';
import AboutPage from '@/pages/public/AboutPage';
import ServicesPage from '@/pages/public/ServicesPage';
import ContactPage from '@/pages/public/ContactPage';
import FaqPage from '@/pages/public/FaqPage';
import NewsPage from '@/pages/public/NewsPage';
import ArticlePage from '@/pages/public/ArticlePage';
import LegalPage from '@/pages/public/LegalPage';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import { ForbiddenPage, NotFoundPage } from '@/pages/errors/ErrorPages';

/* -------------------------------------------------------------------------- */
/* Back-office (chargement paresseux)                                          */
/* -------------------------------------------------------------------------- */
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'));
const AppointmentsPage = lazy(() => import('@/pages/admin/AppointmentsPage'));
const PatientsPage = lazy(() => import('@/pages/admin/PatientsPage'));
const PatientDetailPage = lazy(() => import('@/pages/admin/PatientDetailPage'));
const ConsultationsPage = lazy(() => import('@/pages/admin/ConsultationsPage'));
const PrescriptionsPage = lazy(() => import('@/pages/admin/PrescriptionsPage'));
const MedicationsPage = lazy(() => import('@/pages/admin/MedicationsPage'));
const StockPage = lazy(() => import('@/pages/admin/StockPage'));
const InvoicesPage = lazy(() => import('@/pages/admin/InvoicesPage'));
const PaymentsPage = lazy(() => import('@/pages/admin/PaymentsPage'));
const ShiftsPage = lazy(() => import('@/pages/admin/ShiftsPage'));
const MeetingsPage = lazy(() => import('@/pages/admin/MeetingsPage'));
const LabPage = lazy(() => import('@/pages/admin/LabPage'));
const NewsAdminPage = lazy(() => import('@/pages/admin/NewsAdminPage'));
const DoctorsAdminPage = lazy(() => import('@/pages/admin/DoctorsAdminPage'));
const SpecialtiesAdminPage = lazy(() => import('@/pages/admin/SpecialtiesAdminPage'));
const DepartmentsAdminPage = lazy(() => import('@/pages/admin/DepartmentsAdminPage'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const RolesPage = lazy(() => import('@/pages/admin/RolesPage'));
const AuditPage = lazy(() => import('@/pages/admin/AuditPage'));
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage'));
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'));
const NotificationsPage = lazy(() => import('@/pages/admin/NotificationsPage'));
const ProfilePage = lazy(() => import('@/pages/admin/ProfilePage'));

/* -------------------------------------------------------------------------- */
/* Espace patient (chargement paresseux)                                       */
/* -------------------------------------------------------------------------- */
const PatientDashboardPage = lazy(() => import('@/pages/patient/PatientDashboardPage'));
const PatientAppointmentsPage = lazy(() => import('@/pages/patient/PatientAppointmentsPage'));
const PatientRecordPage = lazy(() => import('@/pages/patient/PatientRecordPage'));
const PatientPrescriptionsPage = lazy(() => import('@/pages/patient/PatientPrescriptionsPage'));
const PatientInvoicesPage = lazy(() => import('@/pages/patient/PatientInvoicesPage'));
const PatientMeetingsPage = lazy(() => import('@/pages/patient/PatientMeetingsPage'));
const PatientProfilePage = lazy(() => import('@/pages/patient/PatientProfilePage'));

/** Enveloppe de chargement pour les modules paresseux. */
function Lazy({ children }: { children: React.ReactNode }): JSX.Element {
  return <Suspense fallback={<FullPageLoader label="Chargement du module…" />}>{children}</Suspense>;
}

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      {/* ---------------------------------------------------------------- */}
      {/* Site public                                                       */}
      {/* ---------------------------------------------------------------- */}
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="medecins" element={<DoctorsPage />} />
        <Route path="specialites" element={<SpecialtiesPage />} />
        <Route path="rendez-vous" element={<BookingPage />} />
        <Route path="teleconsultation" element={<TeleconsultationPage />} />
        <Route path="a-propos" element={<AboutPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="faq" element={<FaqPage />} />
        <Route path="actualites" element={<NewsPage />} />
        <Route path="actualites/:slug" element={<ArticlePage />} />
        <Route path="mentions-legales" element={<LegalPage />} />
        <Route path="urgences" element={<ContactPage />} />
      </Route>

      {/* ---------------------------------------------------------------- */}
      {/* Authentification                                                  */}
      {/* ---------------------------------------------------------------- */}
      <Route
        path="/connexion"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/inscription"
        element={
          <RedirectIfAuthenticated>
            <RegisterPage />
          </RedirectIfAuthenticated>
        }
      />

      {/* ---------------------------------------------------------------- */}
      {/* Back-office                                                       */}
      {/* ---------------------------------------------------------------- */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute staffOnly>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <ProtectedRoute permission="dashboard:read">
              <Lazy>
                <DashboardPage />
              </Lazy>
            </ProtectedRoute>
          }
        />
        <Route
          path="agenda"
          element={
            <Lazy>
              <AppointmentsPage />
            </Lazy>
          }
        />
        <Route
          path="rendez-vous"
          element={
            <Lazy>
              <AppointmentsPage />
            </Lazy>
          }
        />
        <Route
          path="patients"
          element={
            <Lazy>
              <PatientsPage />
            </Lazy>
          }
        />
        <Route
          path="patients/:id"
          element={
            <Lazy>
              <PatientDetailPage />
            </Lazy>
          }
        />
        <Route
          path="consultations"
          element={
            <Lazy>
              <ConsultationsPage />
            </Lazy>
          }
        />
        <Route
          path="ordonnances"
          element={
            <Lazy>
              <PrescriptionsPage />
            </Lazy>
          }
        />
        <Route
          path="medicaments"
          element={
            <Lazy>
              <MedicationsPage />
            </Lazy>
          }
        />
        <Route
          path="stock"
          element={
            <Lazy>
              <StockPage />
            </Lazy>
          }
        />
        <Route
          path="factures"
          element={
            <Lazy>
              <InvoicesPage />
            </Lazy>
          }
        />
        <Route
          path="paiements"
          element={
            <Lazy>
              <PaymentsPage />
            </Lazy>
          }
        />
        <Route
          path="gardes"
          element={
            <Lazy>
              <ShiftsPage />
            </Lazy>
          }
        />
        <Route
          path="teleconsultations"
          element={
            <Lazy>
              <MeetingsPage />
            </Lazy>
          }
        />
        <Route
          path="laboratoire"
          element={
            <Lazy>
              <LabPage />
            </Lazy>
          }
        />
        <Route
          path="actualites"
          element={
            <Lazy>
              <NewsAdminPage />
            </Lazy>
          }
        />
        <Route
          path="medecins"
          element={
            <Lazy>
              <DoctorsAdminPage />
            </Lazy>
          }
        />
        <Route
          path="specialites"
          element={
            <Lazy>
              <SpecialtiesAdminPage />
            </Lazy>
          }
        />
        <Route
          path="departements"
          element={
            <Lazy>
              <DepartmentsAdminPage />
            </Lazy>
          }
        />
        <Route
          path="utilisateurs"
          element={
            <Lazy>
              <UsersPage />
            </Lazy>
          }
        />
        <Route
          path="roles"
          element={
            <Lazy>
              <RolesPage />
            </Lazy>
          }
        />
        <Route
          path="audit"
          element={
            <Lazy>
              <AuditPage />
            </Lazy>
          }
        />
        <Route
          path="rapports"
          element={
            <Lazy>
              <ReportsPage />
            </Lazy>
          }
        />
        <Route
          path="parametres"
          element={
            <Lazy>
              <SettingsPage />
            </Lazy>
          }
        />
        <Route
          path="notifications"
          element={
            <Lazy>
              <NotificationsPage />
            </Lazy>
          }
        />
        <Route
          path="mon-profil"
          element={
            <Lazy>
              <ProfilePage />
            </Lazy>
          }
        />
      </Route>

      {/* ---------------------------------------------------------------- */}
      {/* Espace patient                                                    */}
      {/* ---------------------------------------------------------------- */}
      <Route
        path="/patient"
        element={
          <ProtectedRoute patientOnly>
            <PatientLayout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <Lazy>
              <PatientDashboardPage />
            </Lazy>
          }
        />
        <Route
          path="rendez-vous"
          element={
            <Lazy>
              <PatientAppointmentsPage />
            </Lazy>
          }
        />
        <Route
          path="dossier"
          element={
            <Lazy>
              <PatientRecordPage />
            </Lazy>
          }
        />
        <Route
          path="ordonnances"
          element={
            <Lazy>
              <PatientPrescriptionsPage />
            </Lazy>
          }
        />
        <Route
          path="factures"
          element={
            <Lazy>
              <PatientInvoicesPage />
            </Lazy>
          }
        />
        <Route
          path="teleconsultations"
          element={
            <Lazy>
              <PatientMeetingsPage />
            </Lazy>
          }
        />
        <Route
          path="profil"
          element={
            <Lazy>
              <PatientProfilePage />
            </Lazy>
          }
        />
        <Route
          path="notifications"
          element={
            <Lazy>
              <NotificationsPage />
            </Lazy>
          }
        />
      </Route>

      {/* ---------------------------------------------------------------- */}
      {/* Erreurs et redirections                                          */}
      {/* ---------------------------------------------------------------- */}
      <Route path="/acces-refuse" element={<ForbiddenPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
