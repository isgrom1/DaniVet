import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Ban, FileText, History, PencilLine, Repeat, ClipboardList } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button, LinkButton } from '@/components/Button';
import { Badge, Card, List, ListRow, Notice, Section } from '@/components/Card';
import { PdfButton } from '@/components/PdfButton';
import { Sheet, promptDialog, toast } from '@/components/overlay';
import { Checkbox, Segmented } from '@/components/form';
import { RichTextView } from '@/components/RichText';
import { useTables } from '@/data/hooks';
import { update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import type { Consultation, ConsultationVersion, Diagnosis, Treatment } from '@/data/schema';
import { AUDIT_ACTION, CONSULT_KIND, CONSULT_STATUS, DOC_KIND, EXAM_STATUS, EXAM_STATUS_TONE, EXAM_TYPE, TABLE_LABEL, TREAT_STATUS } from '@/data/labels';
import { formatDate, formatDateTime, todayISO } from '@/lib/dates';
import { formatDecimal } from '@/lib/numbers';
import { safeFileName } from '@/lib/share';
import { AttachmentGrid, AttachmentPicker } from '@/features/attachments/AttachmentViews';
import { AlertsPanel } from '@/features/patients/AlertsPanel';
import { latestWeight, patientAlerts, patientsOfTutor, speciesName } from '@/features/patients/selectors';
import { pdf } from '@/pdf';
import { ConsultationEditor } from './ConsultationEditor';
import { consultationSummary, type SummarySection } from './summary';
import { voidConsultation } from './actions';

export function ConsultationPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const tables = useTables();
  const c = tables.consultations.get(id);
  if (!c) {
    return (
      <>
        <PageHeader title="Consulta" back="/" />
        <Page>
          <Notice tone="warning">No se encontró esta consulta.</Notice>
        </Page>
      </>
    );
  }
  if (c.status === 'draft') return <ConsultationEditor key={`${c.id}-draft`} consultationId={c.id} mode="draft" />;
  if (c.status === 'final' && params.get('modo') === 'enmendar') return <ConsultationEditor key={`${c.id}-amend-${c.version}`} consultationId={c.id} mode="amend" />;
  return <ConsultationView c={c} />;
}

export function SummaryCards({ sections }: { sections: SummarySection[] }) {
  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <Card key={s.title} className="space-y-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">{s.title}</h3>
          <dl className="space-y-2">
            {s.rows.map((r, i) => (
              <div key={i}>
                <dt className="text-sm font-semibold text-ink-600">{r.label}</dt>
                <dd className="whitespace-pre-wrap text-[15px] text-ink-900">{r.rich ? <RichTextView text={r.value} /> : r.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  );
}

/**
 * «Indicaciones al tutor». Si el tutor tiene otros pacientes activos, la profesional puede incluirlos en el mismo
 * PDF (por ejemplo, gatitos de una camada con las mismas indicaciones); ninguno viene marcado.
 */
function OwnerInstructionsButton({ c }: { c: Consultation }) {
  const tables = useTables();
  const patient = tables.patients.get(c.patientId);
  const others = patientsOfTutor(tables, c.tutorId).filter((p) => p.id !== c.patientId && p.status === 'active');
  const [chosen, setChosen] = useState<string[]>([]);
  const selected = others.filter((p) => chosen.includes(p.id));
  const describe = (id: string, speciesId: string) => {
    const w = latestWeight(tables, id);
    return [speciesName(tables, speciesId), w ? `último peso ${formatDecimal(w.weightKg)} kg (${formatDate(w.date)})` : 'sin peso registrado'].filter(Boolean).join(' · ');
  };
  return (
    <PdfButton
      make={() => pdf.ownerInstructions(c.id, selected.map((p) => p.id))}
      fileName={`indicaciones-${safeFileName([patient?.name ?? 'paciente', ...selected.map((p) => p.name)].join(' y '))}-${c.startedAt.slice(0, 10)}.pdf`}
      label="Indicaciones al tutor"
      icon={<ClipboardList className="size-4" />}
      ask={
        others.length
          ? {
              title: 'Indicaciones al tutor',
              confirmLabel: 'Generar PDF',
              body: (
                <div className="space-y-2">
                  <p className="text-[15px] text-ink-700">¿Para quiénes son estas indicaciones? Los pacientes que marques aparecen en el mismo PDF, con su peso.</p>
                  <Checkbox checked disabled onChange={() => undefined} label={patient?.name ?? 'Paciente'} description="Paciente de esta consulta" />
                  {others.map((p) => (
                    <Checkbox
                      key={p.id}
                      checked={chosen.includes(p.id)}
                      onChange={(v) => setChosen((prev) => (v ? [...prev, p.id] : prev.filter((x) => x !== p.id)))}
                      label={p.name}
                      description={describe(p.id, p.speciesId)}
                    />
                  ))}
                </div>
              ),
            }
          : undefined
      }
    />
  );
}

function ConsultationView({ c }: { c: Consultation }) {
  const tables = useTables();
  const patient = tables.patients.get(c.patientId);
  const [versionOpen, setVersionOpen] = useState<ConsultationVersion | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const sections = consultationSummary(tables, c);
  const treatments = [...tables.treatments.values()].filter((t) => t.consultationId === c.id);
  const versions = [...tables.consultationVersions.values()].filter((v) => v.consultationId === c.id).sort((a, b) => b.version - a.version);
  const attachments = [...tables.attachments.values()].filter((a) => a.consultationId === c.id);
  const exams = [...tables.exams.values()].filter((e) => e.consultationId === c.id);
  const docs = [...tables.documents.values()].filter((d) => d.consultationId === c.id);
  const rx = [...tables.prescriptions.values()].filter((r) => r.consultationId === c.id);
  const vacs = [...tables.vaccinations.values()].filter((v) => v.consultationId === c.id);
  const followUps = [...tables.consultations.values()].filter((x) => x.followUpOfId === c.id);
  const childIds = new Set([c.id, ...treatments.map((t) => t.id), ...[...tables.diagnoses.values()].filter((d) => d.consultationId === c.id).map((d) => d.id)]);
  const audit = [...tables.auditLog.values()].filter((a) => childIds.has(a.entityId)).sort((a, b) => b.at.localeCompare(a.at));

  const voidIt = async () => {
    const reason = await promptDialog({
      title: 'Anular consulta',
      message: 'La consulta se conservará marcada como anulada (no se borra). Los tratamientos en curso quedarán suspendidos.',
      label: 'Motivo de la anulación',
      multiline: true,
      confirmLabel: 'Anular consulta',
    });
    if (!reason) return;
    try {
      await voidConsultation(c.id, reason);
      toast.success('Consulta anulada');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const setTreatmentStatus = async (t: Treatment, status: Treatment['status']) => {
    try {
      await update('treatments', t.id, { status, endDate: status !== 'active' && !t.endDate ? todayISO() : t.endDate }, { summary: `Tratamiento ${TREAT_STATUS[status].toLowerCase()}` });
      toast.success(`Tratamiento: ${TREAT_STATUS[status].toLowerCase()}`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <>
      <PageHeader title={patient?.name ?? 'Consulta'} subtitle={`${CONSULT_KIND[c.kind]} · ${formatDateTime(c.startedAt)}`} back={patient ? `/pacientes/${patient.id}?tab=historial` : '/'} />
      <Page className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={c.status === 'final' ? 'success' : 'danger'}>{CONSULT_STATUS[c.status]}</Badge>
          {c.version > 1 && <Badge tone="warning">Enmendada · versión {c.version}</Badge>}
          {c.finalizedAt && <span className="text-sm text-ink-500">Finalizada el {formatDateTime(c.finalizedAt)}</span>}
        </div>
        {c.status === 'voided' && (
          <Notice tone="danger" title="Consulta anulada">
            Motivo: {c.voidReason}
          </Notice>
        )}
        {patient && <AlertsPanel alerts={patientAlerts(patient, tables)} compact />}

        {c.status === 'final' && (
          <div className="grid grid-cols-2 gap-2">
            <PdfButton make={() => pdf.consultation(c.id)} fileName={`informe-${safeFileName(patient?.name ?? 'paciente')}-${c.startedAt.slice(0, 10)}.pdf`} label="Informe clínico" icon={<FileText className="size-4" />} />
            <OwnerInstructionsButton c={c} />
            <LinkButton to={`/consulta?patientId=${c.patientId}&followUpOf=${c.id}`} variant="soft" icon={<Repeat className="size-4" />}>
              Registrar control
            </LinkButton>
            <LinkButton to={`/consultas/${c.id}?modo=enmendar`} variant="secondary" icon={<PencilLine className="size-4" />}>
              Corregir / enmendar
            </LinkButton>
          </div>
        )}

        <SummaryCards sections={sections} />

        {treatments.length > 0 && c.status === 'final' && (
          <Section title="Estado de los tratamientos" description="Puedes actualizar el estado durante el seguimiento sin enmendar la consulta.">
            {treatments.map((t) => (
              <Card key={t.id} className="space-y-2">
                <p className="font-semibold">{t.name}</p>
                <Segmented name={`Estado de ${t.name}`} size="sm" value={t.status} onChange={(v) => void setTreatmentStatus(t, v)} options={Object.entries(TREAT_STATUS).map(([k, v]) => ({ value: k as Treatment['status'], label: v }))} />
              </Card>
            ))}
          </Section>
        )}

        {(followUps.length > 0 || exams.length > 0 || rx.length > 0 || docs.length > 0 || vacs.length > 0) && (
          <Section title="Registros vinculados">
            <List>
              {followUps.map((f) => (
                <ListRow key={f.id} to={`/consultas/${f.id}`} title={`Control del ${formatDate(f.startedAt)}`} trailing={<Badge>{CONSULT_STATUS[f.status]}</Badge>} />
              ))}
              {exams.map((e) => (
                <ListRow key={e.id} to={`/examenes/${e.id}`} title={`Examen: ${e.name || EXAM_TYPE[e.type]}`} trailing={<Badge tone={EXAM_STATUS_TONE[e.status]}>{EXAM_STATUS[e.status]}</Badge>} />
              ))}
              {rx.map((r) => (
                <ListRow key={r.id} to={`/recetas/${r.id}`} title={`Receta: ${r.items.map((i) => i.medicationName).join(', ')}`} />
              ))}
              {vacs.map((v) => (
                <ListRow key={v.id} to={`/vacunas/${v.id}`} title={`Vacuna: ${v.vaccineName}`} />
              ))}
              {docs.map((d) => (
                <ListRow key={d.id} to={`/documentos/${d.id}`} title={DOC_KIND[d.kind]} />
              ))}
            </List>
          </Section>
        )}

        <Section title="Adjuntos">
          {c.status !== 'voided' && <AttachmentPicker base={{ ownerKind: 'consultation', consultationId: c.id, patientId: c.patientId }} />}
          <AttachmentGrid items={attachments} />
        </Section>

        <Section title="Trazabilidad">
          <Card className="space-y-2">
            {(c.dictations?.length ?? 0) > 0 && (
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-semibold text-ink-800">Texto dictado ({c.dictations!.length})</summary>
                <ul className="space-y-2 pb-2">
                  {c.dictations!.map((d) => (
                    <li key={d.id} className="text-sm">
                      <span className="font-semibold text-ink-600">{formatDateTime(d.at)}</span>
                      <p className="whitespace-pre-wrap text-ink-800">{d.text}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {versions.length === 0 ? (
              <p className="text-sm text-ink-500">Sin enmiendas: esta es la versión original.</p>
            ) : (
              <List>
                {versions.map((v) => (
                  <ListRow key={v.id} onClick={() => setVersionOpen(v)} title={`Versión ${v.version} (reemplazada el ${formatDateTime(v.savedAt)})`} subtitle={`Motivo: ${v.reason}`} />
                ))}
              </List>
            )}
            <Button variant="ghost" size="sm" icon={<History className="size-4" />} onClick={() => setAuditOpen(true)}>
              Ver historial de cambios ({audit.length})
            </Button>
          </Card>
        </Section>

        {c.status === 'final' && (
          <Button variant="ghost" className="text-red-700" icon={<Ban className="size-4" />} onClick={voidIt}>
            Anular consulta
          </Button>
        )}
      </Page>
      {versionOpen && (
        <Sheet open onClose={() => setVersionOpen(null)} title={`Versión ${versionOpen.version}`} size="full">
          <Notice tone="neutral" className="mb-3">
            Contenido de la consulta antes de la enmienda del {formatDateTime(versionOpen.savedAt)}. Motivo: {versionOpen.reason}
          </Notice>
          <SummaryCards
            sections={consultationSummary(
              tables,
              versionOpen.snapshot.consultation as Consultation,
              versionOpen.snapshot.diagnoses as Diagnosis[],
              versionOpen.snapshot.treatments as Treatment[],
            )}
          />
        </Sheet>
      )}
      {auditOpen && (
        <Sheet open onClose={() => setAuditOpen(false)} title="Historial de cambios" size="full">
          <ol className="space-y-2">
            {audit.map((a) => (
              <li key={a.id} className="card p-3 text-sm">
                <p className="font-semibold">
                  {formatDateTime(a.at)} · {AUDIT_ACTION[a.action]} · {TABLE_LABEL[a.entity] ?? a.entity}
                </p>
                {a.reason && <p className="text-ink-700">Motivo: {a.reason}</p>}
                {a.summary && <p className="text-ink-600">{a.summary}</p>}
                {a.changes && a.changes.length > 0 && <p className="text-ink-500">Campos: {a.changes.map((x) => x.field).join(', ')}</p>}
              </li>
            ))}
          </ol>
          <Link to="/historial" className="mt-3 block text-sm font-semibold text-brand-700">
            Ver historial completo de la app
          </Link>
        </Sheet>
      )}
    </>
  );
}
