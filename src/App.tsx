import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { DialogHost, Toaster } from '@/components/overlay';
import { OfflineBanner, TabBar } from '@/components/layout';
import { Spinner } from '@/components/Card';
import { Logo } from '@/components/Logo';
import { useDataStore } from '@/data/store';
import { lock, refreshVaultStatus } from '@/data/session';
import { startCrossTabSync } from '@/data/repo';
import { useSettings } from '@/data/hooks';
import { flushAll } from '@/lib/flush';
import { useUiState } from '@/lib/uiState';
import { applyUpdate } from '@/lib/sw';
import { Onboarding } from '@/features/auth/Onboarding';
import { Unlock } from '@/features/auth/Unlock';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { AgendaPage } from '@/features/agenda/AgendaPage';
import { AppointmentForm } from '@/features/agenda/AppointmentForm';
import { AppointmentDetail } from '@/features/agenda/AppointmentDetail';
import { PatientsList } from '@/features/patients/PatientsList';
import { PatientForm } from '@/features/patients/PatientForm';
import { PatientDetail } from '@/features/patients/PatientDetail';
import { PatientHistoryForm } from '@/features/patients/PatientHistoryForm';
import { TutorsList } from '@/features/tutors/TutorsList';
import { TutorForm } from '@/features/tutors/TutorForm';
import { TutorDetail } from '@/features/tutors/TutorDetail';
import { TutorMerge } from '@/features/tutors/TutorMerge';
import { NewConsultation } from '@/features/consultations/NewConsultation';
import { ConsultationPage } from '@/features/consultations/ConsultationPage';
import { PrescriptionPage } from '@/features/prescriptions/PrescriptionPage';
import { VaccinationForm } from '@/features/preventive/VaccinationForm';
import { DewormingForm } from '@/features/preventive/DewormingForm';
import { PreventivePage } from '@/features/preventive/PreventivePage';
import { ExamForm } from '@/features/exams/ExamForm';
import { ExamsPage } from '@/features/exams/ExamsPage';
import { DocumentPage } from '@/features/documents/DocumentPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { FinanceHome } from '@/features/finance/FinanceHome';
import { ChargeForm } from '@/features/finance/ChargeForm';
import { ChargeDetail } from '@/features/finance/ChargeDetail';
import { ExpensesPage } from '@/features/finance/ExpensesPage';
import { ExpenseForm } from '@/features/finance/ExpenseForm';
import { BudgetsPage } from '@/features/finance/BudgetsPage';
import { BudgetForm } from '@/features/finance/BudgetForm';
import { ReportsPage } from '@/features/finance/ReportsPage';
import { ChargesPage } from '@/features/finance/ChargesPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { InventoryItemForm } from '@/features/inventory/InventoryItemForm';
import { InventoryItemDetail } from '@/features/inventory/InventoryItemDetail';
import { SearchPage } from '@/features/search/SearchPage';
import { MoreMenu } from '@/features/more/MoreMenu';
import { ProfileSettings } from '@/features/settings/ProfileSettings';
import { ServicesSettings } from '@/features/settings/ServicesSettings';
import { AgendaSettings } from '@/features/settings/AgendaSettings';
import { SpeciesSettings } from '@/features/settings/SpeciesSettings';
import { MedicationRefsSettings } from '@/features/settings/MedicationRefsSettings';
import { ProtocolsSettings } from '@/features/settings/ProtocolsSettings';
import { TemplatesSettings } from '@/features/settings/TemplatesSettings';
import { PaymentMethodsSettings } from '@/features/settings/PaymentMethodsSettings';
import { AiSettings } from '@/features/settings/AiSettings';
import { DashboardSettings } from '@/features/settings/DashboardSettings';
import { SecuritySettings } from '@/features/settings/SecuritySettings';
import { BackupSettings } from '@/features/settings/BackupSettings';
import { DemoDataSettings } from '@/features/settings/DemoDataSettings';
import { PrivacyInfo } from '@/features/settings/PrivacyInfo';
import { AboutPage } from '@/features/settings/AboutPage';
import { AuditLogPage } from '@/features/audit/AuditLogPage';
import { HelpPage } from '@/features/more/HelpPage';
import { WhatsNew } from '@/features/more/WhatsNew';

export function App() {
  const status = useDataStore((s) => s.status);
  const onboarding = useUiState((s) => s.onboarding);

  useEffect(() => {
    void refreshVaultStatus();
    startCrossTabSync();
  }, []);

  let content;
  if (status === 'checking') content = <Splash />;
  else if (status === 'none' || (onboarding && status === 'ready')) content = <Onboarding />;
  else if (status === 'locked') content = <Unlock />;
  else if (status === 'loading') content = <Splash text="Descifrando tus datos…" />;
  else
    content = (
      <HashRouter>
        <AppShell />
      </HashRouter>
    );

  return (
    <>
      {content}
      <DialogHost />
      <Toaster />
    </>
  );
}

function Splash({ text }: { text?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-sand-100">
      <Logo size={72} />
      {text && (
        <p className="flex items-center gap-2 text-[15px] text-ink-600">
          <Spinner /> {text}
        </p>
      )}
    </div>
  );
}

/** Bloqueo automático por inactividad o al volver tras un tiempo en segundo plano. */
function useAutoLock(minutes: number) {
  useEffect(() => {
    const limit = minutes * 60_000;
    let last = Date.now();
    let hiddenAt: number | null = null;
    let locking = false;
    const doLock = async () => {
      if (locking) return;
      locking = true;
      await flushAll();
      lock();
    };
    const bump = () => {
      last = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    for (const e of events) window.addEventListener(e, bump, { passive: true });
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        void flushAll();
      } else {
        if (hiddenAt && Date.now() - hiddenAt >= limit) void doLock();
        hiddenAt = null;
        last = Date.now();
      }
    };
    const onPageHide = () => void flushAll();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - last >= limit) void doLock();
    }, 10_000);
    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      clearInterval(iv);
    };
  }, [minutes]);
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function UpdateBanner() {
  const ready = useUiState((s) => s.updateReady);
  if (!ready) return null;
  return (
    <div className="flex items-center justify-between gap-3 bg-brand-800 px-4 py-2 text-[14px] text-white no-print" role="status">
      <span>Hay una versión nueva. Se instala sola al bloquear la app.</span>
      <button type="button" onClick={() => void applyUpdate()} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-white/15 px-3 font-semibold">
        <RefreshCw className="size-4" /> Actualizar ahora
      </button>
    </div>
  );
}

function AppShell() {
  const settings = useSettings();
  useAutoLock(settings.security.autoLockMinutes);
  return (
    <div className="min-h-dvh">
      <ScrollToTop />
      <OfflineBanner />
      <UpdateBanner />
      <WhatsNew />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/agenda/nueva" element={<AppointmentForm />} />
        <Route path="/agenda/:id" element={<AppointmentDetail />} />
        <Route path="/agenda/:id/editar" element={<AppointmentForm />} />
        <Route path="/pacientes" element={<PatientsList />} />
        <Route path="/pacientes/nuevo" element={<PatientForm />} />
        <Route path="/pacientes/:id" element={<PatientDetail />} />
        <Route path="/pacientes/:id/editar" element={<PatientForm />} />
        <Route path="/pacientes/:id/antecedentes" element={<PatientHistoryForm />} />
        <Route path="/tutores" element={<TutorsList />} />
        <Route path="/tutores/nuevo" element={<TutorForm />} />
        <Route path="/tutores/fusionar" element={<TutorMerge />} />
        <Route path="/tutores/:id" element={<TutorDetail />} />
        <Route path="/tutores/:id/editar" element={<TutorForm />} />
        <Route path="/consulta" element={<NewConsultation />} />
        <Route path="/consultas/:id" element={<ConsultationPage />} />
        <Route path="/recetas/nueva" element={<PrescriptionPage />} />
        <Route path="/recetas/:id" element={<PrescriptionPage />} />
        <Route path="/preventivo" element={<PreventivePage />} />
        <Route path="/vacunas/nueva" element={<VaccinationForm />} />
        <Route path="/vacunas/:id" element={<VaccinationForm />} />
        <Route path="/desparasitaciones/nueva" element={<DewormingForm />} />
        <Route path="/desparasitaciones/:id" element={<DewormingForm />} />
        <Route path="/examenes" element={<ExamsPage />} />
        <Route path="/examenes/nuevo" element={<ExamForm />} />
        <Route path="/examenes/:id" element={<ExamForm />} />
        <Route path="/documentos/nuevo" element={<DocumentPage />} />
        <Route path="/documentos/:id" element={<DocumentPage />} />
        <Route path="/tareas" element={<TasksPage />} />
        <Route path="/finanzas" element={<FinanceHome />} />
        <Route path="/finanzas/cobros" element={<ChargesPage />} />
        <Route path="/finanzas/cobros/nuevo" element={<ChargeForm />} />
        <Route path="/finanzas/cobros/:id" element={<ChargeDetail />} />
        <Route path="/finanzas/gastos" element={<ExpensesPage />} />
        <Route path="/finanzas/gastos/nuevo" element={<ExpenseForm />} />
        <Route path="/finanzas/gastos/:id" element={<ExpenseForm />} />
        <Route path="/finanzas/presupuestos" element={<BudgetsPage />} />
        <Route path="/finanzas/presupuestos/nuevo" element={<BudgetForm />} />
        <Route path="/finanzas/presupuestos/:id" element={<BudgetForm />} />
        <Route path="/finanzas/reportes" element={<ReportsPage />} />
        <Route path="/inventario" element={<InventoryPage />} />
        <Route path="/inventario/nuevo" element={<InventoryItemForm />} />
        <Route path="/inventario/:id" element={<InventoryItemDetail />} />
        <Route path="/inventario/:id/editar" element={<InventoryItemForm />} />
        <Route path="/buscar" element={<SearchPage />} />
        <Route path="/mas" element={<MoreMenu />} />
        <Route path="/ayuda" element={<HelpPage />} />
        <Route path="/historial" element={<AuditLogPage />} />
        <Route path="/ajustes/perfil" element={<ProfileSettings />} />
        <Route path="/ajustes/servicios" element={<ServicesSettings />} />
        <Route path="/ajustes/agenda" element={<AgendaSettings />} />
        <Route path="/ajustes/especies" element={<SpeciesSettings />} />
        <Route path="/ajustes/medicamentos" element={<MedicationRefsSettings />} />
        <Route path="/ajustes/pautas" element={<ProtocolsSettings />} />
        <Route path="/ajustes/plantillas" element={<TemplatesSettings />} />
        <Route path="/ajustes/pagos" element={<PaymentMethodsSettings />} />
        <Route path="/ajustes/inicio" element={<DashboardSettings />} />
        <Route path="/ajustes/ia" element={<AiSettings />} />
        <Route path="/ajustes/seguridad" element={<SecuritySettings />} />
        <Route path="/ajustes/respaldo" element={<BackupSettings />} />
        <Route path="/ajustes/demo" element={<DemoDataSettings />} />
        <Route path="/ajustes/privacidad" element={<PrivacyInfo />} />
        <Route path="/ajustes/acerca" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </div>
  );
}
