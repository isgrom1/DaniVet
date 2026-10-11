import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { Checkbox, Field, Segmented, Select, TextArea, TextInput } from '@/components/form';
import { DraftBanner } from '@/components/DraftBanner';
import { toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { update } from '@/data/repo';
import { friendlyError, ValidationError } from '@/data/errors';
import type { Allergy, Condition, CurrentMed, Patient, PatientAlert } from '@/data/schema';
import { CONDITION_STATUS, SEVERITY } from '@/data/labels';
import { newId, nowISO } from '@/lib/ids';
import { todayISO } from '@/lib/dates';
import { emptyToUndef } from '@/lib/objects';
import { useFormDraft } from '@/lib/useFormDraft';

type BG = Patient['background'];
interface FormState {
  allergies: Allergy[];
  adverseReactions: Allergy[];
  conditions: Condition[];
  currentMedications: CurrentMed[];
  alerts: PatientAlert[];
  background: Record<keyof BG, string>;
}

const BG_FIELDS: Array<{ key: keyof BG; label: string; hint?: string }> = [
  { key: 'previousDiseases', label: 'Enfermedades previas' },
  { key: 'surgeries', label: 'Cirugías anteriores' },
  { key: 'vaccinationHistory', label: 'Antecedentes de vacunación', hint: 'Historial previo a esta app. Las vacunas nuevas se registran en su propio módulo.' },
  { key: 'dewormingInternal', label: 'Desparasitación interna (antecedentes)' },
  { key: 'dewormingExternal', label: 'Desparasitación externa (antecedentes)' },
  { key: 'diet', label: 'Alimentación' },
  { key: 'habitat', label: 'Hábitat' },
  { key: 'lifestyle', label: 'Estilo de vida' },
  { key: 'behavior', label: 'Antecedentes conductuales' },
  { key: 'familyEpidemiological', label: 'Antecedentes familiares o epidemiológicos' },
  { key: 'other', label: 'Otros antecedentes relevantes' },
];

const SOURCE_OPTS = [
  { value: 'professional', label: 'Registrado por mí' },
  { value: 'owner', label: 'Informado por el tutor' },
  { value: 'document', label: 'De un documento' },
] as const;

function fromPatient(p: Patient): FormState {
  const bg = {} as Record<keyof BG, string>;
  for (const f of BG_FIELDS) bg[f.key] = p.background[f.key] ?? '';
  return {
    allergies: p.allergies,
    adverseReactions: p.adverseReactions,
    conditions: p.conditions,
    currentMedications: p.currentMedications,
    alerts: p.alerts,
    background: bg,
  };
}

export function PatientHistoryForm() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const tables = useTables();
  const patient = tables.patients.get(id);
  if (!patient) {
    return (
      <>
        <PageHeader title="Antecedentes" back="/pacientes" />
        <Page>
          <Notice tone="warning">No se encontró el paciente.</Notice>
        </Page>
      </>
    );
  }
  return <HistoryEditor patient={patient} onDone={() => navigate(`/pacientes/${patient.id}`, { replace: true })} />;
}

function HistoryEditor({ patient, onDone }: { patient: Patient; onDone: () => void }) {
  const form = useFormDraft<FormState>(`form:history:${patient.id}`, () => fromPatient(patient));
  const f = form.value;
  const [saving, setSaving] = useState(false);

  const setList = <K extends 'allergies' | 'adverseReactions' | 'conditions' | 'currentMedications' | 'alerts'>(key: K, list: FormState[K]) => form.setField(key, list);
  const patch = <K extends 'allergies' | 'adverseReactions' | 'conditions' | 'currentMedications' | 'alerts'>(key: K, idx: number, p: Partial<FormState[K][number]>) =>
    form.set((prev) => ({ ...prev, [key]: (prev[key] as Array<object>).map((x, i) => (i === idx ? { ...x, ...p } : x)) }));

  const save = async () => {
    const clean = <T extends { [k: string]: unknown }>(list: T[], nameKey: keyof T) => list.filter((x) => String(x[nameKey] ?? '').trim());
    const background: BG = {};
    for (const bf of BG_FIELDS) background[bf.key] = emptyToUndef(f.background[bf.key]);
    setSaving(true);
    try {
      await update(
        'patients',
        patient.id,
        (cur) => ({
          ...cur,
          allergies: clean(f.allergies, 'substance').map((a) => ({ ...a, substance: a.substance.trim(), reaction: emptyToUndef(a.reaction) })),
          adverseReactions: clean(f.adverseReactions, 'substance').map((a) => ({ ...a, substance: a.substance.trim(), reaction: emptyToUndef(a.reaction) })),
          conditions: clean(f.conditions, 'name').map((c) => ({ ...c, name: c.name.trim(), since: emptyToUndef(c.since), notes: emptyToUndef(c.notes) })),
          currentMedications: clean(f.currentMedications, 'name').map((m) => ({
            ...m,
            name: m.name.trim(),
            dose: emptyToUndef(m.dose),
            frequency: emptyToUndef(m.frequency),
            since: emptyToUndef(m.since),
            notes: emptyToUndef(m.notes),
          })),
          alerts: clean(f.alerts, 'text').map((a) => ({ ...a, text: a.text.trim() })),
          background,
        }),
        { baseRev: patient.rev, summary: 'Antecedentes y alertas' },
      );
      await form.done();
      toast.success('Antecedentes guardados');
      onDone();
    } catch (e) {
      toast.error(e instanceof ValidationError ? e.message : friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const newAllergy = (): Allergy => ({ id: newId(), substance: '', severity: 'unknown', source: 'professional', confirmed: false, notedAt: todayISO() });

  return (
    <>
      <PageHeader
        title={`Antecedentes: ${patient.name}`}
        back={`/pacientes/${patient.id}`}
        actions={
          <Button size="sm" onClick={save} loading={saving}>
            Guardar
          </Button>
        }
      />
      <Page>
        {form.restorable && <DraftBanner at={form.restorable.at} onRestore={form.restore} onDiscard={form.discardDraft} />}
        <Notice tone="info">
          Registra solo lo que conoces. Marca como <strong>confirmado</strong> lo que verificaste; lo informado por el tutor sin verificar aparecerá como
          “Por confirmar” en las alertas.
        </Notice>

        <ListSection title="Alergias" onAdd={() => setList('allergies', [...f.allergies, newAllergy()])} empty="Sin alergias registradas.">
          {f.allergies.map((a, i) => (
            <AllergyRow key={a.id} value={a} label="Sustancia o medicamento" onChange={(p) => patch('allergies', i, p)} onRemove={() => setList('allergies', f.allergies.filter((_, j) => j !== i))} />
          ))}
        </ListSection>

        <ListSection title="Reacciones adversas" onAdd={() => setList('adverseReactions', [...f.adverseReactions, newAllergy()])} empty="Sin reacciones adversas registradas.">
          {f.adverseReactions.map((a, i) => (
            <AllergyRow key={a.id} value={a} label="Producto o agente" onChange={(p) => patch('adverseReactions', i, p)} onRemove={() => setList('adverseReactions', f.adverseReactions.filter((_, j) => j !== i))} />
          ))}
        </ListSection>

        <ListSection
          title="Enfermedades crónicas o condiciones relevantes"
          onAdd={() => setList('conditions', [...f.conditions, { id: newId(), name: '', chronic: true, status: 'active', source: 'professional', confirmed: false }])}
          empty="Sin condiciones registradas."
        >
          {f.conditions.map((c, i) => (
            <Card key={c.id} className="space-y-3">
              <div className="flex gap-2">
                <Field label="Enfermedad o condición" className="flex-1">
                  <TextInput value={c.name} onChange={(e) => patch('conditions', i, { name: e.target.value })} />
                </Field>
                <RemoveButton onClick={() => setList('conditions', f.conditions.filter((_, j) => j !== i))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Estado">
                  <Select value={c.status} onChange={(e) => patch('conditions', i, { status: e.target.value as Condition['status'] })} aria-label="Estado">
                    {Object.entries(CONDITION_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Desde">
                  <TextInput value={c.since ?? ''} onChange={(e) => patch('conditions', i, { since: e.target.value })} placeholder="2024, hace 2 años…" />
                </Field>
              </div>
              <Field label="Notas">
                <TextInput value={c.notes ?? ''} onChange={(e) => patch('conditions', i, { notes: e.target.value })} />
              </Field>
              <Checkbox checked={c.chronic} onChange={(v) => patch('conditions', i, { chronic: v })} label="Es crónica" />
              <SourceFields source={c.source} confirmed={c.confirmed} onChange={(p) => patch('conditions', i, p)} />
            </Card>
          ))}
        </ListSection>

        <ListSection
          title="Medicamentos actuales"
          onAdd={() => setList('currentMedications', [...f.currentMedications, { id: newId(), name: '', source: 'owner', confirmed: false }])}
          empty="Sin medicación actual registrada."
        >
          {f.currentMedications.map((m, i) => (
            <Card key={m.id} className="space-y-3">
              <div className="flex gap-2">
                <Field label="Medicamento" className="flex-1">
                  <TextInput value={m.name} onChange={(e) => patch('currentMedications', i, { name: e.target.value })} />
                </Field>
                <RemoveButton onClick={() => setList('currentMedications', f.currentMedications.filter((_, j) => j !== i))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dosis (como fue indicada)">
                  <TextInput value={m.dose ?? ''} onChange={(e) => patch('currentMedications', i, { dose: e.target.value })} />
                </Field>
                <Field label="Frecuencia">
                  <TextInput value={m.frequency ?? ''} onChange={(e) => patch('currentMedications', i, { frequency: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Desde">
                  <TextInput value={m.since ?? ''} onChange={(e) => patch('currentMedications', i, { since: e.target.value })} />
                </Field>
                <Field label="Notas">
                  <TextInput value={m.notes ?? ''} onChange={(e) => patch('currentMedications', i, { notes: e.target.value })} />
                </Field>
              </div>
              <SourceFields source={m.source} confirmed={m.confirmed} onChange={(p) => patch('currentMedications', i, p)} />
            </Card>
          ))}
        </ListSection>

        <ListSection
          title="Otras alertas (manejo, conducta, precauciones)"
          onAdd={() => setList('alerts', [...f.alerts, { id: newId(), text: '', level: 'warning', pendingConfirmation: false, createdAt: nowISO() }])}
          empty="Sin alertas adicionales."
        >
          {f.alerts.map((a, i) => (
            <Card key={a.id} className="space-y-3">
              <div className="flex gap-2">
                <Field label="Alerta" className="flex-1">
                  <TextInput value={a.text} onChange={(e) => patch('alerts', i, { text: e.target.value })} placeholder="Muerde al manipular orejas, usar bozal…" />
                </Field>
                <RemoveButton onClick={() => setList('alerts', f.alerts.filter((_, j) => j !== i))} />
              </div>
              <Segmented
                name="Nivel"
                size="sm"
                value={a.level}
                onChange={(v) => patch('alerts', i, { level: v })}
                options={[
                  { value: 'critical', label: 'Crítica', tone: 'danger' },
                  { value: 'warning', label: 'Precaución' },
                  { value: 'info', label: 'Información' },
                ]}
              />
              <Checkbox checked={a.pendingConfirmation} onChange={(v) => patch('alerts', i, { pendingConfirmation: v })} label="Pendiente de confirmar" />
            </Card>
          ))}
        </ListSection>

        <Section title="Antecedentes clínicos y de manejo">
          <Card className="space-y-4">
            {BG_FIELDS.map((bf) => (
              <Field key={bf.key} label={bf.label} hint={bf.hint}>
                <TextArea value={f.background[bf.key]} onChange={(e) => form.setField(`background.${bf.key}`, e.target.value)} minRows={2} />
              </Field>
            ))}
          </Card>
        </Section>
      </Page>
      <StickyActions>
        <Button
          variant="secondary"
          onClick={async () => {
            await form.discardDraft();
            await form.done();
            onDone();
          }}
        >
          Cancelar
        </Button>
        <Button block onClick={save} loading={saving}>
          Guardar antecedentes
        </Button>
      </StickyActions>
    </>
  );
}

function ListSection({ title, onAdd, children, empty }: { title: string; onAdd: () => void; children: ReactNode; empty: string }) {
  const arr = Array.isArray(children) ? children : [children];
  return (
    <Section
      title={title}
      action={
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={onAdd}>
          Agregar
        </Button>
      }
    >
      {arr.filter(Boolean).length === 0 ? <p className="px-1 text-sm text-ink-500">{empty}</p> : <div className="space-y-2">{children}</div>}
    </Section>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Quitar" className="mt-6 flex size-11 shrink-0 items-center justify-center rounded-full text-red-700 active:bg-red-50">
      <Trash2 className="size-5" />
    </button>
  );
}

function SourceFields({ source, confirmed, onChange }: { source: string; confirmed: boolean; onChange: (p: { source?: Allergy['source']; confirmed?: boolean }) => void }) {
  return (
    <div className="space-y-2 rounded-xl bg-sand-100 p-3">
      <Segmented name="Origen" size="sm" value={source as 'professional'} onChange={(v) => onChange({ source: v })} options={SOURCE_OPTS.map((o) => ({ value: o.value, label: o.label }))} />
      <Checkbox checked={confirmed} onChange={(v) => onChange({ confirmed: v })} label="Confirmado por la profesional" />
    </div>
  );
}

function AllergyRow({ value: a, label, onChange, onRemove }: { value: Allergy; label: string; onChange: (p: Partial<Allergy>) => void; onRemove: () => void }) {
  return (
    <Card className="space-y-3">
      <div className="flex gap-2">
        <Field label={label} className="flex-1">
          <TextInput value={a.substance} onChange={(e) => onChange({ substance: e.target.value })} />
        </Field>
        <RemoveButton onClick={onRemove} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reacción observada">
          <TextInput value={a.reaction ?? ''} onChange={(e) => onChange({ reaction: e.target.value })} />
        </Field>
        <Field label="Severidad">
          <Select value={a.severity} onChange={(e) => onChange({ severity: e.target.value as Allergy['severity'] })} aria-label="Severidad">
            {Object.entries(SEVERITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <SourceFields source={a.source} confirmed={a.confirmed} onChange={onChange} />
    </Card>
  );
}
