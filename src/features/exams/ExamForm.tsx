import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FlaskConical, ListTodo, UserRound } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, Card, Notice, Section } from '@/components/Card';
import { DateInput, Field, ProvenanceTag, Segmented, Select, TextArea, TextInput } from '@/components/form';
import { DraftBanner } from '@/components/DraftBanner';
import { PatientPickerSheet } from '@/components/pickers';
import { toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { insert, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { EXAM_STATUS, EXAM_STATUS_TONE, EXAM_TYPE } from '@/data/labels';
import type { Exam } from '@/data/schema';
import { addDays, formatDate, formatDateTime, todayISO } from '@/lib/dates';
import { emptyToUndef } from '@/lib/objects';
import { useFormDraft } from '@/lib/useFormDraft';
import { AttachmentGrid, AttachmentPicker } from '@/features/attachments/AttachmentViews';

interface FormState {
  patientId: string;
  type: Exam['type'];
  name: string;
  requestedAt: string;
  lab: string;
  sampleDate: string;
  status: Exam['status'];
  results: string;
  resultsSource: NonNullable<Exam['resultsSource']>;
  receivedAt: string;
  interpretation: string;
  followUpAction: string;
}

export function ExamForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const existing = id ? tables.exams.get(id) : undefined;
  const consultationId = existing?.consultationId ?? params.get('consultationId') ?? undefined;
  const form = useFormDraft<FormState>(`form:exam:${id ?? `new:${params.get('patientId') ?? ''}:${consultationId ?? ''}`}`, () => ({
    patientId: existing?.patientId ?? params.get('patientId') ?? '',
    type: existing?.type ?? 'hemogram',
    name: existing?.name ?? '',
    requestedAt: existing?.requestedAt ?? todayISO(),
    lab: existing?.lab ?? '',
    sampleDate: existing?.sampleDate ?? '',
    status: existing?.status ?? 'requested',
    results: existing?.results ?? '',
    resultsSource: existing?.resultsSource ?? 'transcribed',
    receivedAt: existing?.receivedAt ?? '',
    interpretation: existing?.interpretation ?? '',
    followUpAction: existing?.followUpAction ?? '',
  }));
  const f = form.value;
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const patient = tables.patients.get(f.patientId);
  const attachments = existing ? [...tables.attachments.values()].filter((a) => a.examId === existing.id) : [];
  const labs = [...new Set([...tables.exams.values()].map((e) => e.lab).filter(Boolean) as string[])];

  const errors = {
    patient: !patient ? 'Elige el paciente' : null,
    requestedAt: !f.requestedAt ? 'Indica la fecha de solicitud' : null,
    sample: f.sampleDate && f.sampleDate < f.requestedAt ? 'La toma de muestra no puede ser anterior a la solicitud' : null,
  };

  const save = async (andStay = false) => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      toast.error('Revisa los campos marcados.');
      return;
    }
    const data = {
      patientId: f.patientId,
      consultationId,
      type: f.type,
      name: emptyToUndef(f.name),
      requestedAt: f.requestedAt,
      lab: emptyToUndef(f.lab),
      sampleDate: emptyToUndef(f.sampleDate),
      status: f.status,
      results: emptyToUndef(f.results),
      resultsSource: f.results.trim() ? f.resultsSource : undefined,
      receivedAt: emptyToUndef(f.receivedAt) ?? (['received', 'reviewed'].includes(f.status) && !existing?.receivedAt ? todayISO() : existing?.receivedAt),
      interpretation: emptyToUndef(f.interpretation),
      followUpAction: emptyToUndef(f.followUpAction),
      reviewedAt: f.status === 'reviewed' ? (existing?.reviewedAt ?? new Date().toISOString()) : undefined,
    };
    setBusy(true);
    try {
      const rec = existing ? await update('exams', existing.id, (cur) => ({ ...cur, ...data }), { baseRev: existing.rev }) : await insert('exams', data);
      await form.done();
      toast.success(existing ? 'Examen actualizado' : 'Examen registrado');
      if (!existing || !andStay) navigate(andStay ? `/examenes/${rec.id}` : consultationId ? `/consultas/${consultationId}` : `/pacientes/${f.patientId}?tab=examenes`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const reviewTask = async () => {
    if (!existing) return;
    try {
      await insert('tasks', { title: `Revisar resultado: ${existing.name || EXAM_TYPE[existing.type]}`, type: 'review_results', dueDate: addDays(todayISO(), 2), status: 'pending', patientId: existing.patientId, consultationId: existing.consultationId, examId: existing.id });
      toast.success('Tarea creada');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <>
      <PageHeader title={existing ? existing.name || EXAM_TYPE[existing.type] : 'Nuevo examen'} back={patient ? `/pacientes/${patient.id}?tab=examenes` : '/examenes'} />
      <Page>
        {form.restorable && <DraftBanner at={form.restorable.at} onRestore={form.restore} onDiscard={form.discardDraft} />}
        {existing && (
          <div className="flex items-center gap-2">
            <Badge tone={EXAM_STATUS_TONE[existing.status]}>{EXAM_STATUS[existing.status]}</Badge>
            {existing.reviewedAt && <span className="text-sm text-ink-500">Revisado el {formatDateTime(existing.reviewedAt)}</span>}
            {existing.consultationId && (
              <Link to={`/consultas/${existing.consultationId}`} className="text-sm font-semibold text-brand-700">
                Ver consulta
              </Link>
            )}
          </div>
        )}
        <Section title="Solicitud">
          <Card className="space-y-4">
            <button type="button" onClick={() => setPicker(true)} disabled={!!existing || !!consultationId} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-sand-300 bg-white px-3 text-left disabled:bg-sand-50">
              <UserRound className="size-5 text-ink-400" />
              <span className="flex-1 font-semibold">{patient?.name ?? 'Elegir paciente'}</span>
            </button>
            {tried && errors.patient && <p className="text-sm font-medium text-red-700">{errors.patient}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de examen">
                <Select value={f.type} onChange={(e) => form.setField('type', e.target.value)} aria-label="Tipo de examen">
                  {Object.entries(EXAM_TYPE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Detalle / nombre">
                <TextInput value={f.name} onChange={(e) => form.setField('name', e.target.value)} placeholder="Perfil renal, Rx tórax…" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de solicitud" required error={tried ? errors.requestedAt : null}>
                <DateInput value={f.requestedAt} onChange={(v) => form.setField('requestedAt', v)} clearable={false} />
              </Field>
              <Field label="Toma de muestra" error={errors.sample}>
                <DateInput value={f.sampleDate} onChange={(v) => form.setField('sampleDate', v)} />
              </Field>
            </div>
            <Field label="Laboratorio o centro">
              <TextInput value={f.lab} onChange={(e) => form.setField('lab', e.target.value)} list="labs" />
              <datalist id="labs">
                {labs.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </Field>
            <Field label="Estado">
              <Select value={f.status} onChange={(e) => form.setField('status', e.target.value)} aria-label="Estado del examen">
                {Object.entries(EXAM_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
        </Section>
        <Section title="Resultados">
          <Card className="space-y-4">
            <Field
              label="Resultados"
              tag={f.results.trim() ? <ProvenanceTag kind={f.resultsSource === 'transcribed' ? 'document' : f.resultsSource === 'attachment' ? 'document' : 'professional'} label={f.resultsSource === 'transcribed' ? 'Transcrito de informe' : f.resultsSource === 'attachment' ? 'Ver adjunto' : 'Registrado'} /> : undefined}
            >
              <TextArea value={f.results} onChange={(e) => form.setField('results', e.target.value)} minRows={4} />
            </Field>
            <Segmented
              name="Origen del resultado"
              size="sm"
              value={f.resultsSource}
              onChange={(v) => form.setField('resultsSource', v)}
              options={[
                { value: 'transcribed', label: 'Transcrito del informe' },
                { value: 'attachment', label: 'En archivo adjunto' },
                { value: 'professional', label: 'Realizado por mí' },
              ]}
            />
            <Field label="Fecha de recepción">
              <DateInput value={f.receivedAt} onChange={(v) => form.setField('receivedAt', v)} />
            </Field>
            <Field label="Interpretación clínica">
              <TextArea value={f.interpretation} onChange={(e) => form.setField('interpretation', e.target.value)} />
            </Field>
            <Field label="Conducta posterior">
              <TextArea value={f.followUpAction} onChange={(e) => form.setField('followUpAction', e.target.value)} />
            </Field>
            {f.status === 'received' && <Notice tone="warning">Al marcarlo como “Revisado” dejará de aparecer en “Resultados por revisar”.</Notice>}
          </Card>
        </Section>
        {existing ? (
          <Section title="Archivos del examen">
            <AttachmentPicker base={{ ownerKind: 'exam', examId: existing.id, patientId: existing.patientId, consultationId: existing.consultationId }} kind="lab_result" label="Adjuntar informe" />
            <AttachmentGrid items={attachments} />
            <Button variant="ghost" size="sm" icon={<ListTodo className="size-4" />} onClick={reviewTask}>
              Crear tarea “Revisar resultado”
            </Button>
          </Section>
        ) : (
          <Notice tone="neutral">Después de guardar podrás adjuntar el informe del laboratorio (foto o PDF).</Notice>
        )}
        {existing && <p className="text-center text-xs text-ink-500">Registrado el {formatDate(existing.createdAt)}</p>}
      </Page>
      <StickyActions>
        <Button variant="secondary" onClick={async () => { await form.discardDraft(); await form.done(); navigate(-1); }}>
          Cancelar
        </Button>
        <Button block onClick={() => save(!existing)} loading={busy} icon={<FlaskConical className="size-4" />}>
          {existing ? 'Guardar cambios' : 'Guardar examen'}
        </Button>
      </StickyActions>
      {picker && (
        <PatientPickerSheet
          onClose={() => setPicker(false)}
          onPick={(p) => {
            form.setField('patientId', p.id);
            setPicker(false);
          }}
        />
      )}
    </>
  );
}
