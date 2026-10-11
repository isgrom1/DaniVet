import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TriangleAlert, UserRound } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { Checkbox, DateInput, Field, IntegerInput, Select, TextArea, TextInput, TimeInput } from '@/components/form';
import { AddressFields, type AddressValue } from '@/components/AddressFields';
import { DraftBanner } from '@/components/DraftBanner';
import { TutorPickerSheet } from '@/components/pickers';
import { confirmDialog, toast } from '@/components/overlay';
import { useSettings, useTables } from '@/data/hooks';
import { insert, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { VISIT_TYPE } from '@/data/labels';
import type { Appointment, VisitType } from '@/data/schema';
import { fromLocalDateTime, isISODate, localDateOf, localTimeOf, todayISO } from '@/lib/dates';
import { emptyToUndef } from '@/lib/objects';
import { nowISO } from '@/lib/ids';
import { useFormDraft } from '@/lib/useFormDraft';
import { patientsOfTutor, primaryTutorId } from '@/features/patients/selectors';
import { scheduleIssues } from './selectors';

interface FormState {
  tutorId: string;
  patientIds: string[];
  date: string;
  time: string;
  durationMin: string;
  travelMin: string;
  visitType: VisitType;
  reason: string;
  addressId: string; // '' = dirección personalizada
  address: AddressValue;
  accessInstructions: string;
  equipment: string;
  precautions: string;
  notes: string;
}

function fromAppt(a: Appointment | undefined, init: Partial<FormState>, defaults: { duration: number; travel: number }): FormState {
  return {
    tutorId: a?.tutorId ?? init.tutorId ?? '',
    patientIds: a?.patientIds ?? init.patientIds ?? [],
    date: a ? localDateOf(a.start) : (init.date ?? todayISO()),
    time: a ? localTimeOf(a.start) : '',
    durationMin: String(a?.durationMin ?? defaults.duration),
    travelMin: a?.travelMin !== undefined ? String(a.travelMin) : String(defaults.travel),
    visitType: a?.visitType ?? 'consultation',
    reason: a?.reason ?? '',
    addressId: a ? (a.addressId ?? '') : '',
    address: a ? { street: a.address.street, comuna: a.address.comuna, city: a.address.city, directions: a.address.directions } : { street: '' },
    accessInstructions: a?.accessInstructions ?? '',
    equipment: a?.equipment ?? '',
    precautions: a?.precautions ?? '',
    notes: a?.notes ?? '',
  };
}

export function AppointmentForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const settings = useSettings();
  const existing = id ? tables.appointments.get(id) : undefined;

  const init = useMemo<Partial<FormState>>(() => {
    const pid = params.get('patientId');
    const p = pid ? tables.patients.get(pid) : undefined;
    const date = params.get('fecha');
    return {
      tutorId: params.get('tutorId') ?? (p ? primaryTutorId(p) : undefined),
      patientIds: p ? [p.id] : [],
      date: date && isISODate(date) ? date : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useFormDraft<FormState>(`form:appointment:${id ?? 'new'}`, () => {
    const s = fromAppt(existing, init, { duration: settings.agenda.defaultDurationMin, travel: settings.agenda.defaultTravelMin });
    if (!existing && s.tutorId) {
      const t = tables.tutors.get(s.tutorId);
      const addr = t?.addresses.find((a) => a.primary) ?? t?.addresses[0];
      if (addr) {
        s.addressId = addr.id;
        s.address = { street: addr.street, comuna: addr.comuna, city: addr.city, directions: addr.directions };
      }
    }
    return s;
  });
  const f = form.value;
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);

  const tutor = tables.tutors.get(f.tutorId);
  const pets = tutor ? patientsOfTutor(tables, tutor.id).filter((p) => p.status !== 'deceased' || f.patientIds.includes(p.id)) : [];
  const start = f.time ? fromLocalDateTime(f.date, f.time) : null;
  const duration = Number(f.durationMin || 0);
  const travel = f.travelMin === '' ? undefined : Number(f.travelMin);

  const issues = useMemo(
    () => (start && duration > 0 ? scheduleIssues(tables, settings, { id, start, durationMin: duration, travelMin: travel }) : []),
    [tables, settings, id, start, duration, travel],
  );

  const errors = {
    tutorId: !f.tutorId ? 'Elige el tutor' : null,
    patientIds: f.patientIds.length === 0 ? 'Selecciona al menos un paciente' : null,
    date: !isISODate(f.date) ? 'Fecha inválida' : null,
    time: !f.time ? 'Indica la hora' : null,
    duration: !(duration >= 5 && duration <= 1440) ? 'Duración entre 5 y 1440 minutos' : null,
    street: !f.address.street.trim() ? 'Indica la dirección de atención' : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const chooseTutor = (tid: string) => {
    const t = tables.tutors.get(tid);
    const addr = t?.addresses.find((a) => a.primary) ?? t?.addresses[0];
    const tpets = patientsOfTutor(tables, tid).filter((p) => p.status === 'active');
    form.set((prev) => ({
      ...prev,
      tutorId: tid,
      patientIds: tpets.length === 1 ? [tpets[0].id] : [],
      addressId: addr?.id ?? '',
      address: addr ? { street: addr.street, comuna: addr.comuna, city: addr.city, directions: addr.directions } : { street: '' },
    }));
  };

  const chooseAddress = (addressId: string) => {
    const a = tutor?.addresses.find((x) => x.id === addressId);
    form.set((prev) => ({
      ...prev,
      addressId,
      address: a ? { street: a.street, comuna: a.comuna, city: a.city, directions: a.directions } : prev.address,
    }));
  };

  const save = async () => {
    setTried(true);
    if (hasErrors || !start) {
      toast.error('Revisa los campos marcados.');
      return;
    }
    const blocking = issues.filter((i) => i.level === 'error');
    if (blocking.length || issues.length) {
      const ok = await confirmDialog({
        title: blocking.length ? 'Horario incompatible' : 'Revisa el horario',
        message: (
          <ul className="list-disc space-y-1 pl-5">
            {issues.map((i, k) => (
              <li key={k}>{i.message}</li>
            ))}
          </ul>
        ),
        confirmLabel: 'Guardar de todas formas',
      });
      if (!ok) return;
    }
    const data = {
      tutorId: f.tutorId,
      patientIds: f.patientIds,
      start,
      durationMin: duration,
      travelMin: travel,
      visitType: f.visitType,
      reason: emptyToUndef(f.reason),
      addressId: f.addressId || undefined,
      address: { street: f.address.street.trim(), comuna: emptyToUndef(f.address.comuna), city: emptyToUndef(f.address.city), directions: emptyToUndef(f.address.directions) },
      accessInstructions: emptyToUndef(f.accessInstructions),
      equipment: emptyToUndef(f.equipment),
      precautions: emptyToUndef(f.precautions),
      notes: emptyToUndef(f.notes),
    };
    setSaving(true);
    try {
      const rec = existing
        ? await update('appointments', existing.id, (cur) => ({ ...cur, ...data }), { baseRev: existing.rev })
        : await insert('appointments', { ...data, status: 'pending', statusLog: [{ status: 'pending', at: nowISO() }], consultationIds: [] });
      await form.done();
      toast.success(existing ? 'Cita actualizada' : 'Visita agendada');
      navigate(`/agenda/${rec.id}`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const alerts = f.patientIds.flatMap((pid) => {
    const p = tables.patients.get(pid);
    if (!p) return [];
    return [...p.alerts.filter((a) => a.level !== 'info').map((a) => `${p.name}: ${a.text}`), ...p.allergies.map((a) => `${p.name}: alergia a ${a.substance}`)];
  });

  return (
    <>
      <PageHeader
        title={existing ? 'Editar cita' : 'Agendar visita'}
        back={existing ? `/agenda/${existing.id}` : '/agenda'}
        actions={
          <Button size="sm" onClick={save} loading={saving}>
            Guardar
          </Button>
        }
      />
      <Page>
        {form.restorable && <DraftBanner at={form.restorable.at} onRestore={form.restore} onDiscard={form.discardDraft} />}
        <Section title="Tutor y pacientes">
          <Card className="space-y-3">
            <button type="button" onClick={() => setPicker(true)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-sand-300 bg-white px-3 text-left">
              <UserRound className="size-5 text-ink-400" />
              <span className="flex-1 font-semibold">{tutor?.fullName ?? 'Elegir tutor'}</span>
              <span className="text-sm text-brand-700">{tutor ? 'Cambiar' : 'Elegir'}</span>
            </button>
            {tried && errors.tutorId && <p className="text-sm font-medium text-red-700">{errors.tutorId}</p>}
            {tutor && (
              <div>
                {pets.length === 0 ? (
                  <Notice tone="warning">Este tutor no tiene pacientes registrados. Regístralos desde su ficha.</Notice>
                ) : (
                  pets.map((p) => (
                    <Checkbox
                      key={p.id}
                      checked={f.patientIds.includes(p.id)}
                      onChange={(v) => form.setField('patientIds', v ? [...f.patientIds, p.id] : f.patientIds.filter((x) => x !== p.id))}
                      label={p.name}
                      description={tables.species.get(p.speciesId)?.name}
                    />
                  ))
                )}
                {tried && errors.patientIds && <p className="text-sm font-medium text-red-700">{errors.patientIds}</p>}
              </div>
            )}
          </Card>
        </Section>

        {alerts.length > 0 && (
          <Notice tone="danger" icon={<TriangleAlert className="size-5" />} title="Alertas de los pacientes">
            <ul className="list-disc pl-5">
              {alerts.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Notice>
        )}

        <Section title="Fecha y hora">
          <Card className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha" required error={tried ? errors.date : null}>
                <DateInput value={f.date} onChange={(v) => form.setField('date', v)} clearable={false} />
              </Field>
              <Field label="Hora" required error={tried ? errors.time : null}>
                <TimeInput value={f.time} onChange={(v) => form.setField('time', v)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duración estimada" error={tried ? errors.duration : null}>
                <IntegerInput value={f.durationMin} onChange={(v) => form.setField('durationMin', v)} unit="min" />
              </Field>
              <Field label="Traslado previo" hint="Minutos estimados para llegar.">
                <IntegerInput value={f.travelMin} onChange={(v) => form.setField('travelMin', v)} unit="min" />
              </Field>
            </div>
            {issues.length > 0 && (
              <div className="space-y-1.5">
                {issues.map((i, k) => (
                  <Notice key={k} tone={i.level === 'error' ? 'danger' : 'warning'}>
                    {i.message}
                  </Notice>
                ))}
              </div>
            )}
          </Card>
        </Section>

        <Section title="Motivo">
          <Card className="space-y-4">
            <Field label="Tipo de visita">
              <Select value={f.visitType} onChange={(e) => form.setField('visitType', e.target.value)} aria-label="Tipo de visita">
                {Object.entries(VISIT_TYPE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Motivo">
              <TextInput value={f.reason} onChange={(e) => form.setField('reason', e.target.value)} placeholder="Vacunación anual, control de otitis…" />
            </Field>
          </Card>
        </Section>

        <Section title="Dirección de atención">
          <Card className="space-y-4">
            {tutor && tutor.addresses.length > 0 && (
              <Field label="Usar dirección del tutor">
                <Select value={f.addressId} onChange={(e) => chooseAddress(e.target.value)} aria-label="Dirección del tutor">
                  {tutor.addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.label ? `${a.label}: ` : '') + a.street}
                    </option>
                  ))}
                  <option value="">Otra dirección</option>
                </Select>
              </Field>
            )}
            <AddressFields value={f.address} onChange={(v) => form.setField('address', v)} showLabel={false} streetError={tried ? errors.street : null} />
          </Card>
        </Section>

        <Section title="Preparación">
          <Card className="space-y-4">
            <Field label="Instrucciones de acceso para esta visita">
              <TextArea value={f.accessInstructions} onChange={(e) => form.setField('accessInstructions', e.target.value)} minRows={2} />
            </Field>
            <Field label="Equipamiento especial">
              <TextArea value={f.equipment} onChange={(e) => form.setField('equipment', e.target.value)} minRows={2} placeholder="Balanza, bozal, kit de toma de muestras…" />
            </Field>
            <Field label="Dificultades de manejo o precauciones">
              <TextArea value={f.precautions} onChange={(e) => form.setField('precautions', e.target.value)} minRows={2} />
            </Field>
            <Field label="Notas">
              <TextArea value={f.notes} onChange={(e) => form.setField('notes', e.target.value)} minRows={2} />
            </Field>
          </Card>
        </Section>
      </Page>
      <StickyActions>
        <Button
          variant="secondary"
          onClick={async () => {
            await form.discardDraft();
            await form.done();
            navigate(-1);
          }}
        >
          Cancelar
        </Button>
        <Button block onClick={save} loading={saving}>
          {existing ? 'Guardar cambios' : 'Agendar'}
        </Button>
      </StickyActions>
      {picker && (
        <TutorPickerSheet
          newHref="/tutores/nuevo?next=appointment"
          onClose={() => setPicker(false)}
          onPick={(t) => {
            chooseTutor(t.id);
            setPicker(false);
          }}
        />
      )}
    </>
  );
}
