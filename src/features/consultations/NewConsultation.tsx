import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, ClipboardList, Plus, Search, Stethoscope } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button, LinkButton } from '@/components/Button';
import { Badge, Card, List, ListRow, Notice, Section } from '@/components/Card';
import { Segmented } from '@/components/form';
import { PatientPickerSheet } from '@/components/pickers';
import { toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { friendlyError } from '@/data/errors';
import { APPT_STATUS, APPT_STATUS_TONE } from '@/data/labels';
import { formatDate, formatDateTime, formatTime, todayISO } from '@/lib/dates';
import { PatientAvatar } from '@/features/attachments/AttachmentViews';
import { appointmentsOnDay } from '@/features/agenda/selectors';
import { patientAlerts, primaryTutor } from '@/features/patients/selectors';
import { AlertsPanel } from '@/features/patients/AlertsPanel';
import { startConsultation } from './actions';

export function NewConsultation() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const patientId = params.get('patientId');
  const followUpOf = params.get('followUpOf');
  const patient = patientId ? tables.patients.get(patientId) : undefined;

  const today = todayISO();
  const todays = useMemo(() => appointmentsOnDay(tables, today, false).filter((a) => a.status !== 'completed'), [tables, today]);
  const drafts = useMemo(() => [...tables.consultations.values()].filter((c) => c.status === 'draft').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [tables]);

  const previous = useMemo(
    () => (patient ? [...tables.consultations.values()].filter((c) => c.patientId === patient.id && c.status === 'final').sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : []),
    [tables, patient],
  );
  const apptToday = patient ? todays.find((a) => a.patientIds.includes(patient.id)) : undefined;
  const [mode, setMode] = useState<'new' | 'control'>(followUpOf ? 'control' : 'new');
  const [controlOf, setControlOf] = useState<string>(followUpOf ?? '');
  const [linkAppt, setLinkAppt] = useState<boolean>(true);
  useEffect(() => {
    if (mode === 'control' && !controlOf && previous[0]) setControlOf(previous[0].id);
  }, [mode, controlOf, previous]);

  const start = async (pid: string, opts: { appointmentId?: string; followUpOfId?: string } = {}) => {
    setBusy(true);
    try {
      const id = await startConsultation({ patientId: pid, ...opts });
      navigate(`/consultas/${id}`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (patient) {
    const existingDraft = drafts.find((d) => d.patientId === patient.id);
    return (
      <>
        <PageHeader title="Nueva consulta" back={`/pacientes/${patient.id}`} />
        <Page>
          <Card className="flex items-center gap-3">
            <PatientAvatar patient={patient} size={52} />
            <div>
              <p className="text-lg font-bold">{patient.name}</p>
              <p className="text-sm text-ink-500">{primaryTutor(tables, patient)?.fullName}</p>
            </div>
          </Card>
          <AlertsPanel alerts={patientAlerts(patient, tables)} />
          {existingDraft && (
            <Notice tone="warning" title="Ya hay una consulta en borrador">
              <Link to={`/consultas/${existingDraft.id}`} className="font-semibold underline">
                Continuar la consulta del {formatDateTime(existingDraft.startedAt)}
              </Link>
            </Notice>
          )}
          <Section title="Tipo de atención">
            <Card className="space-y-3">
              <Segmented
                name="Tipo"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'new', label: 'Consulta' },
                  { value: 'control', label: 'Control de una consulta anterior' },
                ]}
              />
              {mode === 'control' &&
                (previous.length ? (
                  <List>
                    {previous.slice(0, 6).map((c) => (
                      <ListRow
                        key={c.id}
                        onClick={() => setControlOf(c.id)}
                        title={c.reason.main || 'Consulta'}
                        subtitle={formatDate(c.startedAt)}
                        chevron={false}
                        trailing={controlOf === c.id ? <Badge tone="brand">Seleccionada</Badge> : undefined}
                      />
                    ))}
                  </List>
                ) : (
                  <Notice tone="neutral">No hay consultas finalizadas anteriores para este paciente.</Notice>
                ))}
            </Card>
          </Section>
          {apptToday && (
            <Card>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" className="size-5 accent-brand-700" checked={linkAppt} onChange={(e) => setLinkAppt(e.target.checked)} />
                <span>
                  Vincular con la visita de hoy a las <strong>{formatTime(apptToday.start)}</strong>
                </span>
              </label>
            </Card>
          )}
          <Button
            block
            size="lg"
            loading={busy}
            disabled={mode === 'control' && !controlOf}
            icon={<Stethoscope className="size-5" />}
            onClick={() => start(patient.id, { appointmentId: apptToday && linkAppt ? apptToday.id : undefined, followUpOfId: mode === 'control' ? controlOf : undefined })}
          >
            Comenzar consulta
          </Button>
          <Button variant="ghost" block onClick={() => setParams({}, { replace: true })}>
            Elegir otro paciente
          </Button>
        </Page>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Nueva consulta" large />
      <Page>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" icon={<Search className="size-5" />} onClick={() => setPicker(true)}>
            Buscar paciente
          </Button>
          <LinkButton to="/pacientes/nuevo" size="lg" variant="secondary" icon={<Plus className="size-5" />}>
            Paciente nuevo
          </LinkButton>
        </div>
        <Section title="Visitas de hoy">
          {todays.length === 0 ? (
            <p className="px-1 text-sm text-ink-500">No hay visitas pendientes hoy. Puedes iniciar una atención sin cita buscando al paciente.</p>
          ) : (
            <List>
              {todays.map((a) => (
                <ListRow
                  key={a.id}
                  to={`/agenda/${a.id}`}
                  leading={<CalendarClock className="size-5 text-brand-700" />}
                  title={`${formatTime(a.start)} · ${a.patientIds.map((id) => tables.patients.get(id)?.name).filter(Boolean).join(', ')}`}
                  subtitle={tables.tutors.get(a.tutorId)?.fullName}
                  trailing={<Badge tone={APPT_STATUS_TONE[a.status]}>{APPT_STATUS[a.status]}</Badge>}
                />
              ))}
            </List>
          )}
        </Section>
        <Section title="Consultas en borrador">
          {drafts.length === 0 ? (
            <p className="px-1 text-sm text-ink-500">No hay borradores pendientes.</p>
          ) : (
            <List>
              {drafts.map((c) => {
                const p = tables.patients.get(c.patientId);
                return (
                  <ListRow
                    key={c.id}
                    to={`/consultas/${c.id}`}
                    leading={p ? <PatientAvatar patient={p} size={40} /> : <ClipboardList className="size-5" />}
                    title={p?.name ?? 'Paciente'}
                    subtitle={`${formatDateTime(c.startedAt)} · ${c.reason.main || 'Sin motivo aún'}`}
                    trailing={<Badge tone="warning">Borrador</Badge>}
                  />
                );
              })}
            </List>
          )}
        </Section>
      </Page>
      {picker && (
        <PatientPickerSheet
          title="¿A quién atenderás?"
          filter={(p) => p.status !== 'deceased'}
          newHref="/pacientes/nuevo"
          onClose={() => setPicker(false)}
          onPick={(p) => {
            setPicker(false);
            setParams({ patientId: p.id }, { replace: true });
          }}
        />
      )}
    </>
  );
}
