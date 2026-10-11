import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, FilePlus2, FlaskConical, Pill, Plus, Syringe, Trash2, Bug, Receipt, ListTodo, FileSignature } from 'lucide-react';
import { Button } from '@/components/Button';
import { Badge, Card, List, ListRow, Notice } from '@/components/Card';
import { DateInput, Field, IntegerInput, ProvenanceTag, Segmented, Select, TextArea, TextInput } from '@/components/form';
import { toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { EXAM_SYSTEMS, type Diagnosis, type FindingStatus, type Treatment } from '@/data/schema';
import { ADHERENCE, DX_KIND, DX_STATUS, EXAM_STATUS, EXAM_STATUS_TONE, EXAM_SYSTEM, EXAM_TYPE, FINDING, MUCOUS_COLORS, TASK_TYPE, TREAT_KIND, TREAT_STATUS, DOC_KIND } from '@/data/labels';
import { addDays, formatDate, todayISO } from '@/lib/dates';
import { formatDecimal } from '@/lib/numbers';
import { newId, nowISO } from '@/lib/ids';
import { getPath } from '@/lib/objects';
import { flushAll } from '@/lib/flush';
import { AttachmentGrid, AttachmentPicker } from '@/features/attachments/AttachmentViews';
import { DoseCalculator } from '@/features/prescriptions/DoseCalculator';
import { latestWeight } from '@/features/patients/selectors';
import { CNumber, CText, ProvenanceFor, useEditor } from './editorContext';
import { addFollowUpTask } from './actions';

export function ReasonSection() {
  return (
    <div className="space-y-4">
      <CText path="reason.main" label="Motivo principal *" rows={1} placeholder="Vómitos desde ayer, control anual…" />
      <CText path="reason.ownerSymptoms" label="Síntomas informados por el tutor" />
      <div className="grid gap-4 sm:grid-cols-2">
        <CText path="reason.onset" label="Fecha de inicio" rows={1} placeholder="Hace 3 días, 10/10…" />
        <CText path="reason.evolution" label="Evolución" rows={1} />
      </div>
      <CText path="reason.related" label="Antecedentes relacionados" />
    </div>
  );
}

export function AnamnesisSection() {
  const { c, change } = useEditor();
  return (
    <div className="space-y-4">
      <CText path="anamnesis.current" label="Historia actual" rows={3} />
      <CText path="anamnesis.medical" label="Antecedentes médicos relevantes" />
      <CText path="anamnesis.diet" label="Alimentación" />
      <CText path="anamnesis.behaviorElimination" label="Conducta y eliminación" />
      <CText path="anamnesis.previousTreatments" label="Tratamientos previos" />
      <CText path="anamnesis.other" label="Otros antecedentes" />
      {c.anamnesis.custom.map((f, i) => (
        <div key={f.id} className="flex gap-2">
          <div className="flex-1 space-y-1.5">
            <TextInput
              value={f.label}
              placeholder="Nombre del campo"
              aria-label="Nombre del campo personalizado"
              onChange={(e) => change((s) => ({ ...s, consultation: { ...s.consultation, anamnesis: { ...s.consultation.anamnesis, custom: s.consultation.anamnesis.custom.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } } }))}
            />
            <TextArea
              value={f.value}
              minRows={2}
              aria-label={f.label || 'Valor del campo personalizado'}
              onChange={(e) => change((s) => ({ ...s, consultation: { ...s.consultation, anamnesis: { ...s.consultation.anamnesis, custom: s.consultation.anamnesis.custom.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) } } }))}
            />
          </div>
          <button
            type="button"
            aria-label="Quitar campo"
            className="flex size-11 items-center justify-center text-red-700"
            onClick={() => change((s) => ({ ...s, consultation: { ...s.consultation, anamnesis: { ...s.consultation.anamnesis, custom: s.consultation.anamnesis.custom.filter((_, j) => j !== i) } } }))}
          >
            <Trash2 className="size-5" />
          </button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        icon={<Plus className="size-4" />}
        onClick={() => change((s) => ({ ...s, consultation: { ...s.consultation, anamnesis: { ...s.consultation.anamnesis, custom: [...s.consultation.anamnesis.custom, { id: newId(), label: '', value: '' }] } } }))}
      >
        Agregar campo personalizado
      </Button>
    </div>
  );
}

const FINDING_OPTS: Array<{ value: FindingStatus; label: string; tone?: 'danger' | 'success' | 'neutral' }> = [
  { value: 'not_evaluated', label: FINDING.not_evaluated, tone: 'neutral' },
  { value: 'normal', label: FINDING.normal, tone: 'success' },
  { value: 'abnormal', label: FINDING.abnormal, tone: 'danger' },
];

function FindingRow({ path, label, extra }: { path: string; label: string; extra?: React.ReactNode }) {
  const { c, setC } = useEditor();
  const status = (getPath(c, `${path}.status`) as FindingStatus | undefined) ?? 'not_evaluated';
  const notes = (getPath(c, `${path}.notes`) as string | undefined) ?? '';
  return (
    <div className="space-y-2 py-3">
      <p className="text-[15px] font-semibold text-ink-800">{label}</p>
      <Segmented name={label} size="sm" value={status} onChange={(v) => setC(`${path}.status`, v)} options={FINDING_OPTS} />
      {status !== 'not_evaluated' && (
        <>
          {extra}
          <TextInput
            value={notes}
            onChange={(e) => setC(`${path}.notes`, e.target.value)}
            placeholder={status === 'abnormal' ? 'Describe el hallazgo' : 'Observación (opcional)'}
            aria-label={`Observación ${label}`}
            invalid={status === 'abnormal' && !notes.trim()}
          />
        </>
      )}
    </div>
  );
}

export function ExamSection() {
  const { c, setC, species, patient } = useEditor();
  const tables = useTables();
  const lw = latestWeight(tables, patient.id);
  const r = species?.refRanges ?? {};
  const scale = species?.bcsScale ?? c.exam.bcs.scale ?? 9;
  const notEvaluated = EXAM_SYSTEMS.filter((k) => (c.exam.systems[k]?.status ?? 'not_evaluated') === 'not_evaluated').length;
  return (
    <div className="space-y-4">
      <Notice tone="neutral">
        Cada campo comienza como <strong>No evaluado</strong> o vacío. Registra solo lo que examinaste: la app nunca completa valores normales automáticamente.
      </Notice>
      <div className="grid grid-cols-2 gap-3">
        <CNumber path="exam.weightKg" label="Peso" unit="kg" hint={lw ? `Último registrado: ${formatDecimal(lw.weightKg)} kg (${formatDate(lw.date)})` : 'Sin registrar'} />
        <CNumber path="exam.temperatureC" label="Temperatura" unit="°C" digits={1} range={r.temperatureC} />
        <CNumber path="exam.heartRateBpm" label="Frec. cardíaca" unit="lpm" integer range={r.heartRateBpm} />
        <CNumber path="exam.respRateRpm" label="Frec. respiratoria" unit="rpm" integer range={r.respRateRpm} />
        <CNumber path="exam.crtSec" label="Llenado capilar (TLLC)" unit="s" digits={1} />
        <Field label={`Condición corporal (1–${scale})`} hint={c.exam.bcs.value === undefined ? 'Sin registrar' : undefined}>
          <Select
            value={c.exam.bcs.value !== undefined ? String(c.exam.bcs.value) : ''}
            onChange={(e) => setC('exam.bcs', { value: e.target.value ? Number(e.target.value) : undefined, scale })}
            aria-label="Condición corporal"
          >
            <option value="">Sin registrar</option>
            {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}/{scale}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="card divide-y divide-sand-100 px-3">
        <FindingRow path="exam.generalState" label="Estado general" />
        <FindingRow
          path="exam.mucous"
          label="Mucosas"
          extra={
            <Select value={c.exam.mucous.color ?? ''} onChange={(e) => setC('exam.mucous.color', e.target.value || undefined)} aria-label="Color de mucosas">
              <option value="">Color sin registrar</option>
              {MUCOUS_COLORS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          }
        />
        <FindingRow path="exam.hydration" label="Hidratación" extra={<CNumber path="exam.hydration.dehydrationPct" label="Deshidratación estimada" unit="%" digits={1} />} />
      </div>
      <div>
        <p className="mb-1 px-1 text-sm text-ink-500">Sistemas ({EXAM_SYSTEMS.length - notEvaluated} evaluados, {notEvaluated} sin evaluar)</p>
        <div className="card divide-y divide-sand-100 px-3">
          {EXAM_SYSTEMS.map((k) => (
            <FindingRow key={k} path={`exam.systems.${k}`} label={EXAM_SYSTEM[k]} />
          ))}
        </div>
      </div>
      <CText path="exam.otherFindings" label="Otros hallazgos" />
      <CText path="exam.notes" label="Observaciones del examen" />
    </div>
  );
}

function newDx(consultationId: string, patientId: string): Diagnosis {
  const now = nowISO();
  return { id: newId(), createdAt: now, updatedAt: now, rev: 0, consultationId, patientId, kind: 'presumptive', name: '', status: 'active' };
}

export function AssessmentSection() {
  const { c, state, change, setC, patient } = useEditor();
  const tables = useTables();
  const knownDx = [...new Set([...tables.diagnoses.values()].map((d) => d.name))].sort();
  const exams = [...tables.exams.values()].filter((e) => e.consultationId === c.id);
  const setDx = (i: number, p: Partial<Diagnosis>) => change((s) => ({ ...s, diagnoses: s.diagnoses.map((d, j) => (j === i ? { ...d, ...p } : d)) }));
  return (
    <div className="space-y-4">
      <Field label="Lista de problemas">
        <div className="space-y-2">
          {c.assessment.problems.map((p, i) => (
            <div key={p.id} className="flex gap-2">
              <TextInput value={p.text} aria-label={`Problema ${i + 1}`} onChange={(e) => setC('assessment.problems', c.assessment.problems.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              <button type="button" aria-label="Quitar problema" className="flex size-11 shrink-0 items-center justify-center text-red-700" onClick={() => setC('assessment.problems', c.assessment.problems.filter((_, j) => j !== i))}>
                <Trash2 className="size-5" />
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setC('assessment.problems', [...c.assessment.problems, { id: newId(), text: '' }])}>
            Agregar problema
          </Button>
        </div>
      </Field>

      <Field label="Diagnósticos">
        <div className="space-y-2">
          {state.diagnoses.map((d, i) => (
            <Card key={d.id} padded={false} className="space-y-2 p-3">
              <div className="flex gap-2">
                <TextInput value={d.name} list="dx-known" placeholder="Diagnóstico" aria-label={`Diagnóstico ${i + 1}`} onChange={(e) => setDx(i, { name: e.target.value })} />
                <button type="button" aria-label="Quitar diagnóstico" className="flex size-11 shrink-0 items-center justify-center text-red-700" onClick={() => change((s) => ({ ...s, diagnoses: s.diagnoses.filter((_, j) => j !== i) }))}>
                  <Trash2 className="size-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={d.kind} onChange={(e) => setDx(i, { kind: e.target.value as Diagnosis['kind'] })} aria-label="Tipo de diagnóstico">
                  {Object.entries(DX_KIND).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
                <Select value={d.status} onChange={(e) => setDx(i, { status: e.target.value as Diagnosis['status'] })} aria-label="Estado del diagnóstico">
                  {Object.entries(DX_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
            </Card>
          ))}
          <datalist id="dx-known">
            {knownDx.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => change((s) => ({ ...s, diagnoses: [...s.diagnoses, newDx(c.id, patient.id)] }))}>
            Agregar diagnóstico
          </Button>
        </div>
      </Field>

      <CText path="assessment.testsRequested" label="Exámenes complementarios solicitados" />
      <div className="space-y-2">
        {exams.length > 0 && (
          <List>
            {exams.map((e) => (
              <ListRow key={e.id} to={`/examenes/${e.id}`} title={e.name || EXAM_TYPE[e.type]} trailing={<Badge tone={EXAM_STATUS_TONE[e.status]}>{EXAM_STATUS[e.status]}</Badge>} />
            ))}
          </List>
        )}
        <NavButton to={`/examenes/nuevo?patientId=${patient.id}&consultationId=${c.id}`} icon={<FlaskConical className="size-4" />}>
          Registrar solicitud de examen
        </NavButton>
      </div>
      <CText path="assessment.resultsAvailable" label="Resultados disponibles" />
      <CText path="assessment.interpretation" label="Interpretación clínica" />
      <CText path="assessment.prognosis" label="Pronóstico" rows={1} />
    </div>
  );
}

/** Navega a otra pantalla guardando antes el borrador. */
export function NavButton({ to, icon, children }: { to: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link to={to} onClick={() => void flushAll()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sand-300 bg-white px-3 text-sm font-semibold text-brand-800 active:bg-sand-200">
      {icon}
      {children}
    </Link>
  );
}

function newTreatment(consultationId: string, patientId: string): Treatment {
  const now = nowISO();
  return { id: newId(), createdAt: now, updatedAt: now, rev: 0, consultationId, patientId, kind: 'medication', name: '', status: 'active', startDate: todayISO() };
}

export function PlanSection() {
  const { c, state, change, patient } = useEditor();
  const tables = useTables();
  const [calcFor, setCalcFor] = useState<number | null>(null);
  const setTx = (i: number, p: Partial<Treatment>) =>
    change((s) => ({
      ...s,
      treatments: s.treatments.map((t, j) => {
        if (j !== i) return t;
        const next = { ...t, ...p };
        // Fecha de término calculada a partir de inicio y duración (editable).
        if (('durationDays' in p || 'startDate' in p) && next.startDate && next.durationDays) next.endDate = addDays(next.startDate, next.durationDays - 1);
        return next;
      }),
    }));
  const lw = latestWeight(tables, patient.id);
  const weights = [
    ...(c.exam.weightKg ? [{ label: 'Peso de esta consulta', kg: c.exam.weightKg, date: c.startedAt.slice(0, 10) }] : []),
    ...(lw && lw.weightKg !== c.exam.weightKg ? [{ label: 'Último peso registrado', kg: lw.weightKg, date: lw.date }] : []),
  ];
  const meds = state.treatments.filter((t) => t.kind === 'medication' && t.name.trim());
  return (
    <div className="space-y-4">
      <Field label="Tratamientos indicados">
        <div className="space-y-2">
          {state.treatments.map((t, i) => (
            <Card key={t.id} padded={false} className="space-y-3 p-3">
              <div className="flex gap-2">
                <Select value={t.kind} onChange={(e) => setTx(i, { kind: e.target.value as Treatment['kind'] })} aria-label="Tipo de tratamiento" className="w-40 shrink-0">
                  {Object.entries(TREAT_KIND).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
                <TextInput value={t.name} placeholder={t.kind === 'medication' ? 'Medicamento' : 'Descripción'} aria-label={`Tratamiento ${i + 1}`} onChange={(e) => setTx(i, { name: e.target.value })} />
                <button type="button" aria-label="Quitar tratamiento" className="flex size-11 shrink-0 items-center justify-center text-red-700" onClick={() => change((s) => ({ ...s, treatments: s.treatments.filter((_, j) => j !== i) }))}>
                  <Trash2 className="size-5" />
                </button>
              </div>
              {t.kind === 'medication' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Principio activo">
                      <TextInput value={t.activeIngredient ?? ''} onChange={(e) => setTx(i, { activeIngredient: e.target.value || undefined })} />
                    </Field>
                    <Field label="Vía">
                      <TextInput value={t.route ?? ''} onChange={(e) => setTx(i, { route: e.target.value || undefined })} list="routes" placeholder="Oral, SC…" />
                    </Field>
                  </div>
                  <Field label="Dosis" tag={t.doseCalc ? <ProvenanceTag kind="calculated" label="Calculada · revisada" /> : undefined}>
                    <div className="flex gap-2">
                      <TextInput value={t.dose ?? ''} onChange={(e) => setTx(i, { dose: e.target.value || undefined, doseCalc: undefined })} placeholder="Ej.: 1 comprimido" />
                      <Button variant="secondary" size="sm" className="shrink-0" icon={<Calculator className="size-4" />} onClick={() => setCalcFor(i)}>
                        Calcular
                      </Button>
                    </div>
                  </Field>
                  <Field label="Frecuencia">
                    <TextInput value={t.frequency ?? ''} onChange={(e) => setTx(i, { frequency: e.target.value || undefined })} placeholder="Cada 12 horas" />
                  </Field>
                </>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Field label="Duración">
                  <IntegerInput value={t.durationDays !== undefined ? String(t.durationDays) : ''} onChange={(v) => setTx(i, { durationDays: v ? Number(v) : undefined })} unit="días" />
                </Field>
                <Field label="Inicio">
                  <DateInput value={t.startDate ?? ''} onChange={(v) => setTx(i, { startDate: v || undefined })} clearable={false} />
                </Field>
                <Field label="Término">
                  <DateInput value={t.endDate ?? ''} onChange={(v) => setTx(i, { endDate: v || undefined })} />
                </Field>
              </div>
              <Field label="Instrucciones">
                <TextArea value={t.instructions ?? ''} onChange={(e) => setTx(i, { instructions: e.target.value || undefined })} minRows={1} />
              </Field>
              <Segmented
                name="Estado del tratamiento"
                size="sm"
                value={t.status}
                onChange={(v) => setTx(i, { status: v })}
                options={Object.entries(TREAT_STATUS).map(([k, v]) => ({ value: k as Treatment['status'], label: v }))}
              />
            </Card>
          ))}
          <datalist id="routes">
            {['Oral', 'Subcutánea (SC)', 'Intramuscular (IM)', 'Intravenosa (IV)', 'Tópica', 'Oftálmica', 'Ótica', 'Transdérmica'].map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => change((s) => ({ ...s, treatments: [...s.treatments, newTreatment(c.id, patient.id)] }))}>
            Agregar tratamiento
          </Button>
        </div>
      </Field>
      {meds.length > 0 && (
        <NavButton to={`/recetas/nueva?consultationId=${c.id}`} icon={<Pill className="size-4" />}>
          Crear receta con estos medicamentos
        </NavButton>
      )}
      <CText path="plan.homeCare" label="Cuidados domiciliarios" />
      <CText path="plan.ownerRecommendations" label="Recomendaciones al tutor" />
      <CText path="plan.pendingTests" label="Exámenes pendientes" />
      <div className="grid gap-4 sm:grid-cols-2">
        <CText path="plan.referralTo" label="Derivación a (profesional o centro)" rows={1} />
        <CText path="plan.referralReason" label="Motivo de la derivación" rows={1} />
      </div>
      <PlanControlDate />
      <CText path="plan.finalNotes" label="Observaciones finales" />
      {calcFor !== null && state.treatments[calcFor] && (
        <DoseCalculator
          weights={weights}
          medicationName={state.treatments[calcFor].name}
          med={[...tables.medicationRefs.values()].find((m) => m.name.toLowerCase() === state.treatments[calcFor].name.trim().toLowerCase())}
          onClose={() => setCalcFor(null)}
          onApply={(r) => {
            setTx(calcFor, {
              dose: r.doseText,
              frequency: r.frequencyText ?? state.treatments[calcFor].frequency,
              durationDays: r.calc.durationDays ? Math.round(r.calc.durationDays) : state.treatments[calcFor].durationDays,
              doseCalc: r.calc,
            });
            setCalcFor(null);
            toast.success('Cálculo incorporado. Revísalo en la indicación.');
          }}
        />
      )}
    </div>
  );
}

function PlanControlDate() {
  const { c, setC } = useEditor();
  return (
    <Field label="Fecha recomendada de control" hint="Aparecerá en Inicio como control próximo.">
      <div className="space-y-2">
        <DateInput value={c.plan.controlDate ?? ''} onChange={(v) => setC('plan.controlDate', v || undefined)} min={todayISO()} />
        <Segmented
          name="Atajos de control"
          size="sm"
          value={undefined}
          onChange={(v) => setC('plan.controlDate', addDays(todayISO(), Number(v)))}
          options={[
            { value: '7', label: '+7 días' },
            { value: '14', label: '+14 días' },
            { value: '30', label: '+30 días' },
          ]}
        />
      </div>
    </Field>
  );
}

export function FollowUpSection() {
  const { c, setC } = useEditor();
  const tables = useTables();
  const prev = c.followUpOfId ? tables.consultations.get(c.followUpOfId) : undefined;
  const prevTx = prev ? [...tables.treatments.values()].filter((t) => t.consultationId === prev.id) : [];
  const prevDx = prev ? [...tables.diagnoses.values()].filter((d) => d.consultationId === prev.id && d.kind !== 'differential') : [];
  return (
    <div className="space-y-4">
      {prev && (
        <Notice tone="neutral" title={`Control de la consulta del ${formatDate(prev.startedAt)}`}>
          <p>Motivo: {prev.reason.main || '—'}</p>
          {prevDx.length > 0 && <p>Diagnóstico: {prevDx.map((d) => d.name).join(', ')}</p>}
          {prevTx.length > 0 && <p>Tratamiento: {prevTx.map((t) => [t.name, t.dose, t.frequency].filter(Boolean).join(' ')).join('; ')}</p>}
          <Link to={`/consultas/${prev.id}`} className="font-semibold underline">
            Ver consulta anterior
          </Link>
        </Notice>
      )}
      <CText path="followUp.symptomsEvolution" label="Evolución de los síntomas" />
      <Field label="Adherencia al tratamiento (informada por el tutor)">
        <Segmented
          name="Adherencia"
          size="sm"
          value={c.followUp?.adherence}
          onChange={(v) => setC('followUp.adherence', v)}
          options={Object.entries(ADHERENCE).map(([k, v]) => ({ value: k as 'good', label: v }))}
        />
      </Field>
      <CText path="followUp.adherenceNotes" label="Detalle de la adherencia" rows={1} />
      <CText path="followUp.clinicalResponse" label="Respuesta clínica" />
      <CText path="followUp.adverseEffects" label="Efectos adversos" />
      <CText path="followUp.newFindings" label="Nuevos hallazgos" />
      <CText path="followUp.adjustments" label="Ajustes del plan terapéutico" />
      <Field label="Próxima revisión">
        <DateInput value={c.followUp?.nextReview ?? ''} onChange={(v) => setC('followUp.nextReview', v || undefined)} min={todayISO()} />
      </Field>
    </div>
  );
}

export function ClosingSection() {
  const { c, patient } = useEditor();
  const tables = useTables();
  const attachments = [...tables.attachments.values()].filter((a) => a.consultationId === c.id);
  const vacs = [...tables.vaccinations.values()].filter((v) => v.consultationId === c.id);
  const dews = [...tables.dewormings.values()].filter((d) => d.consultationId === c.id);
  const rx = [...tables.prescriptions.values()].filter((r) => r.consultationId === c.id);
  const docs = [...tables.documents.values()].filter((d) => d.consultationId === c.id);
  const charges = [...tables.charges.values()].filter((x) => x.consultationId === c.id);
  const tasks = [...tables.tasks.values()].filter((x) => x.consultationId === c.id);
  const linked = [
    ...vacs.map((v) => ({ key: v.id, to: `/vacunas/${v.id}`, title: `Vacuna: ${v.vaccineName}` })),
    ...dews.map((d) => ({ key: d.id, to: `/desparasitaciones/${d.id}`, title: `Desparasitación: ${d.product}` })),
    ...rx.map((r) => ({ key: r.id, to: `/recetas/${r.id}`, title: `Receta (${r.status === 'issued' ? 'emitida' : r.status === 'draft' ? 'borrador' : 'anulada'})` })),
    ...docs.map((d) => ({ key: d.id, to: `/documentos/${d.id}`, title: DOC_KIND[d.kind] })),
    ...charges.map((x) => ({ key: x.id, to: `/finanzas/cobros/${x.id}`, title: 'Cobro registrado' })),
  ];
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState<keyof typeof TASK_TYPE>('contact_owner');
  const [taskDue, setTaskDue] = useState(addDays(todayISO(), 3));
  const addTask = async () => {
    if (!taskTitle.trim()) return;
    try {
      await addFollowUpTask({ consultationId: c.id, patientId: patient.id, title: taskTitle.trim(), type: taskType, dueDate: taskDue || undefined, assignee: tables.profile.get('profile')?.fullName });
      setTaskTitle('');
      toast.success('Tarea creada');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="space-y-5">
      <Field label="Fotografías y documentos de la atención">
        <div className="space-y-2">
          <AttachmentPicker base={{ ownerKind: 'consultation', consultationId: c.id, patientId: patient.id }} />
          <AttachmentGrid items={attachments} emptyText="Sin adjuntos en esta consulta." />
        </div>
      </Field>
      <Field label="Registros de esta atención">
        <div className="space-y-2">
          {linked.length > 0 && (
            <List>
              {linked.map((x) => (
                <ListRow key={x.key} to={x.to} title={x.title} />
              ))}
            </List>
          )}
          <div className="flex flex-wrap gap-2">
            <NavButton to={`/vacunas/nueva?patientId=${patient.id}&consultationId=${c.id}`} icon={<Syringe className="size-4" />}>
              Vacuna
            </NavButton>
            <NavButton to={`/desparasitaciones/nueva?patientId=${patient.id}&consultationId=${c.id}`} icon={<Bug className="size-4" />}>
              Desparasitación
            </NavButton>
            <NavButton to={`/recetas/nueva?consultationId=${c.id}`} icon={<Pill className="size-4" />}>
              Receta
            </NavButton>
            <NavButton to={`/documentos/nuevo?patientId=${patient.id}&consultationId=${c.id}`} icon={<FileSignature className="size-4" />}>
              Documento
            </NavButton>
            <NavButton to={`/finanzas/cobros/nuevo?consultationId=${c.id}`} icon={<Receipt className="size-4" />}>
              Cobro
            </NavButton>
          </div>
        </div>
      </Field>
      <Field label="Tareas de seguimiento">
        <div className="space-y-2">
          {tasks.length > 0 && (
            <List>
              {tasks.map((x) => (
                <ListRow key={x.id} to={`/tareas?id=${x.id}`} leading={<ListTodo className="size-5 text-ink-400" />} title={x.title} subtitle={`${TASK_TYPE[x.type]}${x.dueDate ? ` · ${formatDate(x.dueDate)}` : ''}`} />
              ))}
            </List>
          )}
          <Card padded={false} className="space-y-2 p-3">
            <TextInput value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Ej.: Llamar para saber cómo sigue" aria-label="Nueva tarea" />
            <div className="grid grid-cols-2 gap-2">
              <Select value={taskType} onChange={(e) => setTaskType(e.target.value as keyof typeof TASK_TYPE)} aria-label="Tipo de tarea">
                {Object.entries(TASK_TYPE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <DateInput value={taskDue} onChange={setTaskDue} />
            </div>
            <Button size="sm" variant="secondary" icon={<FilePlus2 className="size-4" />} disabled={!taskTitle.trim()} onClick={addTask}>
              Agregar tarea
            </Button>
          </Card>
        </div>
      </Field>
    </div>
  );
}

export { ProvenanceFor };
