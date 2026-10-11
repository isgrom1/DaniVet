import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ban, CalendarPlus, Car, CheckCheck, Clock, MessageCircle, Pencil, Receipt, Stethoscope, Trash2 } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { ActionLink, Button, LinkButton } from '@/components/Button';
import { Badge, Card, KeyValue, List, ListRow, Notice, Section } from '@/components/Card';
import { ContactActions, MapLinks } from '@/components/ContactActions';
import { Sheet, confirmDialog, promptDialog, toast } from '@/components/overlay';
import { useProfile, useSettings, useTables } from '@/data/hooks';
import { batch, remove, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { APPT_STATUS, APPT_STATUS_TONE, CONSULT_STATUS, VISIT_TYPE } from '@/data/labels';
import type { AppointmentStatus } from '@/data/schema';
import { formatDate, formatDateTime, formatTime } from '@/lib/dates';
import { nowISO } from '@/lib/ids';
import { addressText } from '@/lib/maps';
import { whatsappHref } from '@/lib/phone';
import { downloadFile, shareFile } from '@/lib/share';
import { cn } from '@/lib/cn';
import { PatientAvatar } from '@/features/attachments/AttachmentViews';
import { patientAlerts } from '@/features/patients/selectors';
import { AlertsPanel } from '@/features/patients/AlertsPanel';
import { startConsultation } from '@/features/consultations/actions';
import { appointmentIcs, apptEnd } from './selectors';
import { capitalizeFirst } from '@/lib/text';

const FLOW: AppointmentStatus[] = ['pending', 'confirmed', 'en_route', 'in_progress', 'completed'];

export function AppointmentDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const tables = useTables();
  const settings = useSettings();
  const profile = useProfile();
  const a = tables.appointments.get(id);
  const [choosePatient, setChoosePatient] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!a) {
    return (
      <>
        <PageHeader title="Cita" back="/agenda" />
        <Page>
          <Notice tone="warning">No se encontró esta cita.</Notice>
        </Page>
      </>
    );
  }
  const tutor = tables.tutors.get(a.tutorId);
  const patients = a.patientIds.map((pid) => tables.patients.get(pid)).filter((p): p is NonNullable<typeof p> => !!p);
  const consultations = a.consultationIds.map((cid) => tables.consultations.get(cid)).filter((c): c is NonNullable<typeof c> => !!c);
  const appName = profile?.appName || 'VetCasa';

  const setStatus = async (status: AppointmentStatus) => {
    try {
      await update('appointments', a.id, (cur) => ({ ...cur, status, statusLog: [...cur.statusLog, { status, at: nowISO() }] }), { summary: `Estado: ${APPT_STATUS[status]}` });
      toast.success(`Estado: ${APPT_STATUS[status]}`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const cancel = async () => {
    const reason = await promptDialog({ title: 'Cancelar cita', label: 'Motivo de la cancelación', confirmLabel: 'Cancelar cita' });
    if (!reason) return;
    try {
      await update('appointments', a.id, (cur) => ({ ...cur, status: 'cancelled', cancelReason: reason, statusLog: [...cur.statusLog, { status: 'cancelled', at: nowISO() }] }), { reason });
      toast.success('Cita cancelada');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const del = async () => {
    if (a.consultationIds.length) {
      toast.error('La cita tiene consultas asociadas: no se puede eliminar. Puedes cancelarla.');
      return;
    }
    const ok = await confirmDialog({ title: 'Eliminar cita', message: 'Úsalo solo si la cita se creó por error. Si fue cancelada, mejor márcala como cancelada.', confirmLabel: 'Eliminar', tone: 'danger' });
    if (!ok) return;
    try {
      await remove('appointments', a.id);
      toast.success('Cita eliminada');
      navigate('/agenda', { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const begin = async (patientId: string) => {
    const existing = consultations.find((c) => c.patientId === patientId && c.status !== 'voided');
    if (existing) {
      navigate(`/consultas/${existing.id}`);
      return;
    }
    setBusy(true);
    try {
      const cid = await startConsultation({ patientId, appointmentId: a.id });
      navigate(`/consultas/${cid}`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const exportCalendar = async () => {
    const ics = appointmentIcs(tables, settings, a, appName);
    const blob = new Blob([ics], { type: 'text/calendar' });
    const name = `visita-${formatDate(a.start).replace(/\//g, '-')}.ics`;
    try {
      const r = await shareFile(blob, name);
      if (r === 'unsupported') downloadFile(blob, name);
      if (r !== 'cancelled') {
        await update('appointments', a.id, { calendarExportedAt: nowISO() }, { audit: false });
        toast.info('Archivo de calendario generado. Verifica en Calendario que el evento quedó agregado.');
      }
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const reminderText = `Hola ${tutor?.fullName.split(' ')[0] ?? ''}, le recuerdo la visita veterinaria${patients.length ? ` para ${patients.map((p) => p.name).join(' y ')}` : ''} el ${formatDate(a.start, 'long')} a las ${formatTime(a.start)}. Saludos, ${profile?.fullName ?? ''}.`;

  const markCompleted = async () => {
    const b = batch();
    b.update('appointments', a.id, (cur) => ({ ...cur, status: 'completed', statusLog: [...cur.statusLog, { status: 'completed', at: nowISO() }] }));
    try {
      await b.commit();
      toast.success('Visita completada');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const currentIdx = FLOW.indexOf(a.status);

  return (
    <>
      <PageHeader
        title={`${formatDate(a.start)} · ${formatTime(a.start)}`}
        back="/agenda"
        actions={
          <LinkButton to={`/agenda/${a.id}/editar`} size="sm" variant="ghost" icon={<Pencil className="size-4" />}>
            Editar
          </LinkButton>
        }
      />
      <Page className="space-y-4">
        <Card className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold">{capitalizeFirst(formatDate(a.start, 'long'))}</p>
              <p className="flex items-center gap-1 text-[15px] text-ink-600">
                <Clock className="size-4" /> {formatTime(a.start)}–{formatTime(apptEnd(a))} ({a.durationMin} min)
                {a.travelMin !== undefined && ` · traslado ${a.travelMin} min`}
              </p>
            </div>
            <Badge tone={APPT_STATUS_TONE[a.status]}>{APPT_STATUS[a.status]}</Badge>
          </div>
          <p className="text-[15px]">
            <strong>{VISIT_TYPE[a.visitType]}</strong>
            {a.reason && ` · ${a.reason}`}
          </p>
          {a.status === 'cancelled' && a.cancelReason && <Notice tone="danger">Cancelada: {a.cancelReason}</Notice>}
        </Card>

        {a.status !== 'cancelled' && (
          <Section title="Estado de la visita">
            <div className="grid grid-cols-5 gap-1">
              {FLOW.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => s !== a.status && void setStatus(s)}
                  aria-pressed={a.status === s}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center rounded-xl px-0.5 text-center text-[11px] font-semibold leading-tight',
                    a.status === s ? 'bg-brand-700 text-white' : i < currentIdx ? 'bg-brand-50 text-brand-800' : 'bg-white text-ink-600 ring-1 ring-sand-300',
                  )}
                >
                  {APPT_STATUS[s]}
                </button>
              ))}
            </div>
          </Section>
        )}

        {patients.map((p) => {
          const al = patientAlerts(p, tables);
          return al.length ? <AlertsPanel key={p.id} alerts={al} compact /> : null;
        })}
        {a.precautions && (
          <Notice tone="danger" title="Precauciones de manejo">
            {a.precautions}
          </Notice>
        )}

        {a.status !== 'cancelled' && (
          <Button block size="lg" loading={busy} icon={<Stethoscope className="size-5" />} onClick={() => (patients.length === 1 ? void begin(patients[0].id) : setChoosePatient(true))}>
            {consultations.some((c) => c.status === 'draft') ? 'Continuar consulta' : 'Iniciar consulta'}
          </Button>
        )}
        {consultations.length > 0 && (
          <List>
            {consultations.map((c) => (
              <ListRow key={c.id} to={`/consultas/${c.id}`} title={`Consulta de ${tables.patients.get(c.patientId)?.name ?? 'paciente'}`} subtitle={formatDateTime(c.startedAt)} trailing={<Badge tone={c.status === 'final' ? 'success' : c.status === 'draft' ? 'warning' : 'danger'}>{CONSULT_STATUS[c.status]}</Badge>} />
            ))}
          </List>
        )}
        {a.status === 'in_progress' && consultations.length > 0 && consultations.every((c) => c.status !== 'draft') && (
          <Button block variant="soft" icon={<CheckCheck className="size-5" />} onClick={markCompleted}>
            Marcar visita como completada
          </Button>
        )}

        <Section title="Pacientes">
          <List>
            {patients.map((p) => (
              <ListRow key={p.id} to={`/pacientes/${p.id}`} leading={<PatientAvatar patient={p} size={40} />} title={p.name} subtitle={tables.species.get(p.speciesId)?.name} />
            ))}
          </List>
        </Section>

        <Section title="Tutor">
          <Card className="space-y-3">
            <Link to={`/tutores/${a.tutorId}`} className="font-semibold text-ink-900">
              {tutor?.fullName ?? 'Tutor no encontrado'}
            </Link>
            <ContactActions phone={tutor?.phone} email={tutor?.email} />
            {tutor?.phone && (
              <div className="space-y-1">
                <ActionLink href={whatsappHref(tutor.phone, reminderText)} icon={<MessageCircle className="size-4" />} className="w-full">
                  Preparar recordatorio por WhatsApp
                </ActionLink>
                <p className="text-xs text-ink-500">Se abre WhatsApp con el mensaje escrito; tú decides si enviarlo. La app no envía mensajes automáticamente.</p>
              </div>
            )}
          </Card>
        </Section>

        <Section title="Dirección">
          <Card className="space-y-2">
            <p className="text-[15px] font-medium">{addressText(a.address) || 'Sin dirección'}</p>
            {a.address.directions && <p className="whitespace-pre-wrap rounded-lg bg-sand-100 p-2 text-sm">{a.address.directions}</p>}
            <MapLinks address={a.address} />
          </Card>
        </Section>

        <Card>
          <dl className="divide-y divide-sand-100">
            <KeyValue label="Instrucciones de acceso" value={a.accessInstructions} />
            <KeyValue label="Equipamiento" value={a.equipment} />
            <KeyValue label="Notas" value={a.notes} />
            <KeyValue label="Calendario" value={a.calendarExportedAt ? `Archivo .ics generado el ${formatDateTime(a.calendarExportedAt)} (verifica en tu Calendario)` : 'No exportado'} />
          </dl>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<CalendarPlus className="size-4" />} onClick={exportCalendar}>
            Agregar a Calendario
          </Button>
          <LinkButton to={`/finanzas/cobros/nuevo?appointmentId=${a.id}`} variant="secondary" icon={<Receipt className="size-4" />}>
            Cobrar
          </LinkButton>
          <LinkButton to={`/finanzas/gastos/nuevo?appointmentId=${a.id}&categoria=travel`} variant="secondary" icon={<Car className="size-4" />}>
            Gasto de traslado
          </LinkButton>
          {a.status !== 'cancelled' ? (
            <Button variant="secondary" className="text-red-700" icon={<Ban className="size-4" />} onClick={cancel}>
              Cancelar cita
            </Button>
          ) : (
            <Button variant="secondary" className="text-red-700" icon={<Trash2 className="size-4" />} onClick={del}>
              Eliminar
            </Button>
          )}
        </div>

        <Section title="Historial de estados">
          <Card>
            <ul className="space-y-1 text-sm text-ink-600">
              {[...a.statusLog].reverse().map((s, i) => (
                <li key={i}>
                  {formatDateTime(s.at)} · {APPT_STATUS[s.status]}
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      </Page>
      {choosePatient && (
        <Sheet open onClose={() => setChoosePatient(false)} title="¿A qué paciente atenderás?">
          <List>
            {patients.map((p) => {
              const c = consultations.find((x) => x.patientId === p.id && x.status !== 'voided');
              return (
                <ListRow
                  key={p.id}
                  onClick={() => {
                    setChoosePatient(false);
                    void begin(p.id);
                  }}
                  leading={<PatientAvatar patient={p} size={40} />}
                  title={p.name}
                  subtitle={c ? `Consulta ${CONSULT_STATUS[c.status].toLowerCase()}` : 'Sin consulta aún'}
                />
              );
            })}
          </List>
        </Sheet>
      )}
    </>
  );
}
