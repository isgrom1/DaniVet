import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, FileSignature, FileText, PenLine, UserRound } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, Card, List, ListRow, Notice, Section } from '@/components/Card';
import { DateInput, Field, Segmented, TextArea, TextInput } from '@/components/form';
import { DraftBanner } from '@/components/DraftBanner';
import { PatientPickerSheet } from '@/components/pickers';
import { PdfButton } from '@/components/PdfButton';
import { confirmDialog, promptDialog, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { batch, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import type { DocumentKind, VetDocument } from '@/data/schema';
import { DOC_KIND } from '@/data/labels';
import { formatDate, formatDateTime, todayISO } from '@/lib/dates';
import { safeFileName } from '@/lib/share';
import { useFormDraft } from '@/lib/useFormDraft';
import { AttachmentGrid, AttachmentPicker } from '@/features/attachments/AttachmentViews';
import { saveAttachment } from '@/features/attachments/attachments';
import { consultationSummary, summaryAsText } from '@/features/consultations/summary';
import { primaryTutor } from '@/features/patients/selectors';
import { pdf } from '@/pdf';
import { SignaturePad } from './SignaturePad';

const FIELDS: Record<DocumentKind, Array<{ key: string; label: string; required?: boolean; rows?: number }>> = {
  consent: [
    { key: 'procedure', label: 'Procedimiento a realizar', required: true, rows: 2 },
    { key: 'risks', label: 'Riesgos y posibles complicaciones informados', rows: 3 },
    { key: 'alternatives', label: 'Alternativas informadas', rows: 2 },
    { key: 'cost', label: 'Costo estimado', rows: 1 },
    { key: 'notes', label: 'Observaciones', rows: 2 },
  ],
  refusal: [
    { key: 'procedure', label: 'Procedimiento recomendado que se rechaza', required: true, rows: 2 },
    { key: 'consequences', label: 'Consecuencias posibles informadas', rows: 3 },
    { key: 'notes', label: 'Observaciones', rows: 2 },
  ],
  referral: [
    { key: 'to', label: 'Derivado a (profesional o centro)', required: true, rows: 1 },
    { key: 'reason', label: 'Motivo de la derivación', required: true, rows: 2 },
    { key: 'summary', label: 'Resumen clínico', rows: 5 },
    { key: 'treatments', label: 'Tratamientos realizados', rows: 3 },
    { key: 'tests', label: 'Exámenes disponibles', rows: 2 },
  ],
  exam_order: [
    { key: 'exams', label: 'Exámenes solicitados', required: true, rows: 3 },
    { key: 'sample', label: 'Tipo de muestra', rows: 1 },
    { key: 'lab', label: 'Laboratorio', rows: 1 },
    { key: 'clinical', label: 'Sospecha clínica / antecedentes', rows: 3 },
  ],
  indications: [
    { key: 'instructions', label: 'Indicaciones', required: true, rows: 5 },
    { key: 'alarms', label: 'Signos de alarma', rows: 3 },
    { key: 'control', label: 'Próximo control', rows: 1 },
  ],
  clinical_report: [{ key: 'report', label: 'Informe', required: true, rows: 10 }],
  vaccine_certificate: [{ key: 'notes', label: 'Observaciones (no aparecen en el certificado)', rows: 2 }],
};

const TEMPLATE_KIND: Partial<Record<DocumentKind, string>> = { consent: 'consent', refusal: 'refusal', indications: 'indications', referral: 'referral', exam_order: 'exam_order' };

interface FormState {
  kind?: DocumentKind;
  patientId: string;
  title: string;
  date: string;
  fields: Record<string, string>;
  prefilledFrom?: string;
}

export function DocumentPage() {
  const { id } = useParams();
  const tables = useTables();
  const doc = id ? tables.documents.get(id) : undefined;
  if (id && !doc) {
    return (
      <>
        <PageHeader title="Documento" back="/" />
        <Page>
          <Notice tone="warning">No se encontró este documento.</Notice>
        </Page>
      </>
    );
  }
  return <DocumentEditor key={doc?.id ?? 'new'} doc={doc} />;
}

function DocumentEditor({ doc }: { doc?: VetDocument }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const consultationId = doc?.consultationId ?? params.get('consultationId') ?? undefined;
  const consultation = consultationId ? tables.consultations.get(consultationId) : undefined;
  const locked = !!doc && doc.status !== 'draft';

  const prefill = (kind: DocumentKind): { fields: Record<string, string>; from?: string } => {
    const tpl = TEMPLATE_KIND[kind] ? [...tables.templates.values()].find((t) => t.kind === TEMPLATE_KIND[kind] && t.active) : undefined;
    const fields: Record<string, string> = { body: tpl?.fields.body ?? '' };
    if (!consultation) return { fields };
    const tx = [...tables.treatments.values()].filter((t) => t.consultationId === consultation.id);
    if (kind === 'referral') {
      fields.reason = consultation.plan.referralReason ?? '';
      fields.to = consultation.plan.referralTo ?? '';
      fields.summary = summaryAsText(consultationSummary(tables, consultation).filter((s) => ['Motivo de consulta', 'Examen físico', 'Evaluación clínica'].includes(s.title)));
      fields.treatments = tx.map((t) => `• ${[t.name, t.dose, t.frequency].filter(Boolean).join(' ')}`).join('\n');
      fields.tests = consultation.assessment.resultsAvailable ?? '';
    } else if (kind === 'indications') {
      fields.instructions = [consultation.plan.homeCare, consultation.plan.ownerRecommendations, ...tx.map((t) => `• ${[t.name, t.dose, t.frequency, t.durationDays ? `${t.durationDays} días` : ''].filter(Boolean).join(' ')}`)].filter(Boolean).join('\n');
      fields.control = consultation.plan.controlDate ? formatDate(consultation.plan.controlDate, 'long') : '';
    } else if (kind === 'exam_order') {
      fields.exams = consultation.assessment.testsRequested ?? '';
      fields.clinical = [consultation.reason.main, ...[...tables.diagnoses.values()].filter((d) => d.consultationId === consultation.id).map((d) => d.name)].filter(Boolean).join(' · ');
    } else if (kind === 'clinical_report') {
      fields.report = summaryAsText(consultationSummary(tables, consultation));
    } else if (kind === 'consent' || kind === 'refusal') {
      fields.procedure = '';
    }
    return { fields, from: `Texto prellenado desde la consulta del ${formatDate(consultation.startedAt)}: revísalo antes de emitir.` };
  };

  const form = useFormDraft<FormState>(`form:document:${doc?.id ?? `new:${params.get('patientId') ?? ''}:${consultationId ?? ''}:${params.get('kind') ?? ''}`}`, () => {
    if (doc) return { kind: doc.kind, patientId: doc.patientId ?? '', title: doc.title, date: doc.date, fields: doc.fields };
    const kind = (params.get('kind') as DocumentKind | null) ?? undefined;
    const p = kind ? prefill(kind) : { fields: {} };
    return {
      kind,
      patientId: consultation?.patientId ?? params.get('patientId') ?? '',
      title: kind ? DOC_KIND[kind] : '',
      date: todayISO(),
      fields: p.fields,
      prefilledFrom: p.from,
    };
  });
  const f = form.value;
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [sigMethod, setSigMethod] = useState<'none' | 'paper' | 'drawn_on_screen'>(doc?.signature?.method ?? 'paper');
  const [signerName, setSignerName] = useState(doc?.signature?.signerName ?? '');
  const [signerRut, setSignerRut] = useState(doc?.signature?.signerRut ?? '');
  const patient = tables.patients.get(f.patientId);
  const tutor = patient ? primaryTutor(tables, patient) : undefined;
  const scans = useMemo(() => (doc ? [...tables.attachments.values()].filter((a) => a.documentId === doc.id && a.kind !== 'signature') : []), [tables, doc]);
  const sigAtt = doc?.signature?.attachmentId ? tables.attachments.get(doc.signature.attachmentId) : undefined;

  if (!f.kind) {
    return (
      <>
        <PageHeader title="Nuevo documento" back={patient ? `/pacientes/${patient.id}` : '/'} />
        <Page>
          <Section title="¿Qué documento necesitas?">
            <List>
              {(Object.keys(FIELDS) as DocumentKind[]).map((k) => (
                <ListRow
                  key={k}
                  leading={<FileText className="size-5 text-brand-700" />}
                  title={DOC_KIND[k]}
                  onClick={() => {
                    const p = prefill(k);
                    form.set((prev) => ({ ...prev, kind: k, title: DOC_KIND[k], fields: p.fields, prefilledFrom: p.from }));
                  }}
                />
              ))}
            </List>
          </Section>
        </Page>
      </>
    );
  }

  const kind = f.kind;
  const required = FIELDS[kind].filter((x) => x.required && !f.fields[x.key]?.trim());
  const needsPatient = !patient;

  const persist = async (issue: boolean) => {
    setTried(true);
    if (needsPatient || required.length || !f.title.trim()) {
      toast.error(needsPatient ? 'Elige el paciente.' : `Completa: ${required.map((r) => r.label).join(', ') || 'título'}.`);
      return null;
    }
    if (issue) {
      const ok = await confirmDialog({
        title: 'Emitir documento',
        message: 'Una vez emitido no podrá editarse (podrás agregar la firma o el escaneo firmado). Si necesitas cambios, anúlalo y crea otro.',
        confirmLabel: 'Emitir',
      });
      if (!ok) return null;
    }
    setBusy(true);
    try {
      const data = {
        kind,
        patientId: f.patientId,
        tutorId: tutor?.id,
        consultationId,
        title: f.title.trim(),
        date: f.date,
        status: issue ? ('issued' as const) : ('draft' as const),
        issuedAt: issue ? new Date().toISOString() : undefined,
        fields: Object.fromEntries(Object.entries(f.fields).filter(([, v]) => v?.trim())),
        signature: { method: sigMethod, signerName: signerName.trim() || undefined, signerRut: signerRut.trim() || undefined, signedAt: doc?.signature?.signedAt, attachmentId: doc?.signature?.attachmentId },
      };
      const b = batch();
      const rec = doc ? b.update('documents', doc.id, (cur) => ({ ...cur, ...data }), { action: issue ? 'finalize' : 'update' }) : b.insert('documents', data);
      await b.commit();
      await form.done();
      toast.success(issue ? 'Documento emitido' : 'Borrador guardado');
      if (!doc) navigate(`/documentos/${rec.id}`, { replace: true });
      return rec;
    } catch (e) {
      toast.error(friendlyError(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveSignature = async (png: Blob) => {
    if (!doc) {
      toast.info('Guarda el borrador antes de firmar.');
      return;
    }
    setBusy(true);
    try {
      const att = await saveAttachment({ file: png, fileName: 'firma.png', ownerKind: 'document', kind: 'signature', documentId: doc.id, patientId: doc.patientId }, { maxDim: 900 });
      await update('documents', doc.id, (cur) => ({
        ...cur,
        signature: { method: 'drawn_on_screen', signerName: signerName.trim() || cur.signature?.signerName || tutor?.fullName, signerRut: signerRut.trim() || cur.signature?.signerRut || tutor?.rut, signedAt: new Date().toISOString(), attachmentId: att.id },
      }));
      toast.success('Trazo de firma guardado');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const voidIt = async () => {
    if (!doc) return;
    const reason = await promptDialog({ title: 'Anular documento', label: 'Motivo', confirmLabel: 'Anular' });
    if (!reason) return;
    try {
      await update('documents', doc.id, { status: 'voided', voidReason: reason }, { action: 'void', reason });
      toast.success('Documento anulado');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const needsOwnerSignature = kind === 'consent' || kind === 'refusal';
  const pdfMake = kind === 'vaccine_certificate' ? () => pdf.vaccineCertificate(f.patientId) : () => pdf.document(doc!.id);

  return (
    <>
      <PageHeader title={DOC_KIND[kind]} back={patient ? `/pacientes/${patient.id}` : '/'} />
      <Page>
        {form.restorable && !locked && <DraftBanner at={form.restorable.at} onRestore={form.restore} onDiscard={form.discardDraft} />}
        {doc && (
          <div className="flex items-center gap-2">
            <Badge tone={doc.status === 'issued' ? 'success' : doc.status === 'draft' ? 'warning' : 'danger'}>{doc.status === 'issued' ? 'Emitido' : doc.status === 'draft' ? 'Borrador' : 'Anulado'}</Badge>
            {doc.issuedAt && <span className="text-sm text-ink-500">Emitido el {formatDateTime(doc.issuedAt)}</span>}
          </div>
        )}
        {doc?.status === 'voided' && <Notice tone="danger">Anulado: {doc.voidReason}</Notice>}
        {f.prefilledFrom && !locked && <Notice tone="warning">{f.prefilledFrom}</Notice>}
        {doc && <PdfButton make={pdfMake} fileName={`${safeFileName(DOC_KIND[kind])}-${safeFileName(patient?.name ?? '')}-${f.date}.pdf`} label="Ver / compartir PDF" variant={doc.status === 'issued' ? 'primary' : 'secondary'} block />}

        <Section title="Datos del documento">
          <Card className="space-y-4">
            <button type="button" onClick={() => setPicker(true)} disabled={locked || !!consultation || !!doc} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-sand-300 bg-white px-3 text-left disabled:bg-sand-50">
              <UserRound className="size-5 text-ink-400" />
              <span className="flex-1 font-semibold">{patient ? `${patient.name} · ${tutor?.fullName ?? ''}` : 'Elegir paciente'}</span>
            </button>
            {tried && needsPatient && <p className="text-sm font-medium text-red-700">Elige el paciente.</p>}
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="Título">
                <TextInput value={f.title} onChange={(e) => form.setField('title', e.target.value)} disabled={locked} />
              </Field>
              <Field label="Fecha">
                <DateInput value={f.date} onChange={(v) => form.setField('date', v)} clearable={false} disabled={locked} />
              </Field>
            </div>
            {FIELDS[kind].map((x) => (
              <Field key={x.key} label={x.label} required={x.required} error={tried && x.required && !f.fields[x.key]?.trim() ? 'Campo obligatorio' : null}>
                <TextArea value={f.fields[x.key] ?? ''} onChange={(e) => form.setField('fields', { ...f.fields, [x.key]: e.target.value })} minRows={x.rows ?? 2} disabled={locked} />
              </Field>
            ))}
            {kind !== 'vaccine_certificate' && kind !== 'clinical_report' && (
              <Field label="Texto del documento" hint="Marcadores disponibles: {tutor}, {rut_tutor}, {paciente}, {especie}, {profesional}, {procedimiento}, {fecha}.">
                <TextArea value={f.fields.body ?? ''} onChange={(e) => form.setField('fields', { ...f.fields, body: e.target.value })} minRows={6} disabled={locked} />
              </Field>
            )}
            {f.fields.note && <p className="text-xs text-ink-500">{f.fields.note}</p>}
          </Card>
        </Section>

        {needsOwnerSignature && (
          <Section title="Firma del tutor/a">
            <Card className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre de quien firma">
                  <TextInput value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder={tutor?.fullName} disabled={doc?.status === 'voided'} />
                </Field>
                <Field label="RUT">
                  <TextInput value={signerRut} onChange={(e) => setSignerRut(e.target.value)} placeholder={tutor?.rut} disabled={doc?.status === 'voided'} />
                </Field>
              </div>
              <Segmented
                name="Forma de firma"
                size="sm"
                value={sigMethod}
                onChange={setSigMethod}
                options={[
                  { value: 'paper', label: 'Firma en papel' },
                  { value: 'drawn_on_screen', label: 'Trazo en pantalla' },
                  { value: 'none', label: 'Sin firma' },
                ]}
              />
              {sigMethod === 'paper' && <p className="text-sm text-ink-600">Imprime el PDF, haz firmar al tutor y adjunta una foto del documento firmado más abajo.</p>}
              {sigMethod === 'drawn_on_screen' && (
                <div className="space-y-2">
                  <Notice tone="warning">El trazo en pantalla se guarda como imagen y deja constancia de la aceptación, pero no equivale a una firma electrónica avanzada.</Notice>
                  {sigAtt ? (
                    <p className="text-sm font-semibold text-emerald-700">Trazo registrado el {formatDateTime(doc?.signature?.signedAt)}.</p>
                  ) : doc ? (
                    <SignaturePad onSave={saveSignature} busy={busy} />
                  ) : (
                    <p className="text-sm text-ink-500">Guarda el borrador para habilitar la firma.</p>
                  )}
                </div>
              )}
            </Card>
          </Section>
        )}

        {doc && (
          <Section title="Documento firmado escaneado (opcional)">
            <AttachmentPicker base={{ ownerKind: 'document', documentId: doc.id, patientId: doc.patientId }} label="Adjuntar foto o PDF" />
            <AttachmentGrid items={scans} emptyText="Sin escaneos adjuntos." />
          </Section>
        )}
        {doc && doc.status === 'issued' && (
          <Button variant="ghost" className="text-red-700" icon={<Ban className="size-4" />} onClick={voidIt}>
            Anular documento
          </Button>
        )}
      </Page>
      {!locked && (
        <StickyActions>
          <Button variant="secondary" onClick={() => persist(false)} loading={busy} icon={<PenLine className="size-4" />}>
            Guardar
          </Button>
          <Button block onClick={() => persist(true)} loading={busy} icon={<FileSignature className="size-4" />}>
            Emitir
          </Button>
        </StickyActions>
      )}
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
