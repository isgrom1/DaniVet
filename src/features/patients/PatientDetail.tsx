import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  CalendarPlus,
  ClipboardList,
  FileSignature,
  FlaskConical,
  ListTodo,
  Pencil,
  Pill,
  Receipt,
  Scale,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Bug,
} from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { LinkButton } from '@/components/Button';
import { Badge, Card, EmptyState, KeyValue, List, ListRow, Notice, Section } from '@/components/Card';
import { ContactActions } from '@/components/ContactActions';
import { PdfButton } from '@/components/PdfButton';
import { Segmented } from '@/components/form';
import { useSettings, useTables } from '@/data/hooks';
import { CONSULT_STATUS, DEWORM_KIND, DX_KIND, DX_STATUS, EXAM_STATUS, EXAM_STATUS_TONE, EXAM_TYPE, PATIENT_STATUS, REPRO, SEX, TREAT_STATUS } from '@/data/labels';
import { ageText, formatDate, formatDateTime, relativeDays } from '@/lib/dates';
import { formatDecimal } from '@/lib/numbers';
import { formatPhone } from '@/lib/phone';
import { cn } from '@/lib/cn';
import { safeFileName } from '@/lib/share';
import { AttachmentGrid, AttachmentPicker, PatientAvatar } from '@/features/attachments/AttachmentViews';
import { controlsDue, examsToReview, openTasks, preventiveDue } from '@/features/reminders/derive';
import { AlertsPanel } from './AlertsPanel';
import { WeightSheet } from './WeightSheet';
import { latestWeight, patientAlerts, patientTimeline, speciesName, tutorsOf, weightHistory, type TimelineKind } from './selectors';
import { pdf } from '@/pdf';
import { LabTrends } from '@/features/exams/LabTrends';

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'historial', label: 'Historial' },
  { key: 'preventivo', label: 'Vacunas' },
  { key: 'examenes', label: 'Exámenes' },
  { key: 'recetas', label: 'Recetas' },
  { key: 'archivos', label: 'Archivos' },
  { key: 'peso', label: 'Peso' },
] as const;

export function PatientDetail() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'resumen') as (typeof TABS)[number]['key'];
  const tables = useTables();
  const settings = useSettings();
  const patient = tables.patients.get(id);
  const [weightOpen, setWeightOpen] = useState(false);

  if (!patient) {
    return (
      <>
        <PageHeader title="Paciente" back="/pacientes" />
        <Page>
          <Notice tone="warning">No se encontró este paciente.</Notice>
        </Page>
      </>
    );
  }

  const alerts = patientAlerts(patient, tables);
  const lw = latestWeight(tables, patient.id);
  const tutors = tutorsOf(tables, patient);
  const primary = tutors.find((x) => x.role === 'primary')?.tutor ?? tutors[0]?.tutor;
  const setTab = (k: string) => setParams({ tab: k }, { replace: true });

  return (
    <>
      <PageHeader
        title={patient.name}
        back="/pacientes"
        actions={
          <LinkButton to={`/pacientes/${patient.id}/editar`} size="sm" variant="ghost" icon={<Pencil className="size-4" />}>
            Editar
          </LinkButton>
        }
      />
      <Page className="space-y-4">
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <PatientAvatar patient={patient} size={64} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xl font-bold text-ink-900">
                {patient.name}
                {patient.status !== 'active' && <Badge tone={patient.status === 'deceased' ? 'danger' : 'neutral'}>{PATIENT_STATUS[patient.status]}</Badge>}
                {patient.demo && <Badge tone="accent">DEMO</Badge>}
              </p>
              <p className="text-sm text-ink-600">
                {[speciesName(tables, patient.speciesId), patient.breed, SEX[patient.sex] !== 'Sin registrar' ? SEX[patient.sex] : null].filter(Boolean).join(' · ')}
              </p>
              <p className="text-sm text-ink-600">
                {[
                  patient.birthDate ? ageText(patient.birthDate, undefined, patient.birthDateEstimated) : 'Edad sin registrar',
                  lw ? `${formatDecimal(lw.weightKg)} kg (${formatDate(lw.date)})` : 'Peso sin registrar',
                ].join(' · ')}
              </p>
            </div>
          </div>
          {primary && (
            <div className="rounded-xl bg-sand-100 p-3">
              <Link to={`/tutores/${primary.id}`} className="block text-sm font-semibold text-ink-800">
                Tutor: {primary.fullName}
                {tutors.length > 1 && <span className="font-normal text-ink-500"> (+{tutors.length - 1})</span>}
                {primary.phone && <span className="font-normal text-ink-500"> · {formatPhone(primary.phone)}</span>}
              </Link>
              <div className="mt-2">
                <ContactActions phone={primary.phone} email={primary.email} />
              </div>
            </div>
          )}
        </Card>

        <AlertsPanel alerts={alerts} editTo={`/pacientes/${patient.id}/antecedentes`} />

        <div className="grid grid-cols-4 gap-2">
          <QuickAction to={`/consulta?patientId=${patient.id}`} icon={<Stethoscope className="size-5" />} label="Consulta" primary />
          <QuickAction to={`/agenda/nueva?patientId=${patient.id}`} icon={<CalendarPlus className="size-5" />} label="Agendar" />
          <QuickAction to={`/vacunas/nueva?patientId=${patient.id}`} icon={<Syringe className="size-5" />} label="Vacuna" />
          <QuickAction to={`/desparasitaciones/nueva?patientId=${patient.id}`} icon={<Bug className="size-5" />} label="Desparasitar" />
          <QuickAction to={`/recetas/nueva?patientId=${patient.id}`} icon={<Pill className="size-5" />} label="Receta" />
          <QuickAction to={`/examenes/nuevo?patientId=${patient.id}`} icon={<FlaskConical className="size-5" />} label="Examen" />
          <QuickAction to={`/documentos/nuevo?patientId=${patient.id}`} icon={<FileSignature className="size-5" />} label="Documento" />
          <QuickAction onClick={() => setWeightOpen(true)} icon={<Scale className="size-5" />} label="Peso" />
        </div>

        <nav className="-mx-4 overflow-x-auto px-4" aria-label="Secciones del paciente">
          <div className="flex w-max gap-1.5" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn('min-h-10 rounded-full px-4 text-sm font-semibold', tab === t.key ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 ring-1 ring-sand-300')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        {tab === 'resumen' && <SummaryTab patientId={patient.id} settings={settings} />}
        {tab === 'historial' && <HistoryTab patientId={patient.id} />}
        {tab === 'preventivo' && <PreventiveTab patientId={patient.id} />}
        {tab === 'examenes' && <ExamsTab patientId={patient.id} />}
        {tab === 'recetas' && <PrescriptionsTab patientId={patient.id} />}
        {tab === 'archivos' && <FilesTab patientId={patient.id} />}
        {tab === 'peso' && <WeightTab patientId={patient.id} onAdd={() => setWeightOpen(true)} />}
      </Page>
      {weightOpen && <WeightSheet patientId={patient.id} onClose={() => setWeightOpen(false)} />}
    </>
  );
}

function QuickAction({ to, onClick, icon, label, primary }: { to?: string; onClick?: () => void; icon: React.ReactNode; label: string; primary?: boolean }) {
  const cls = cn(
    'flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[12px] font-semibold',
    primary ? 'bg-brand-700 text-white' : 'bg-white text-ink-800 ring-1 ring-sand-200 active:bg-sand-100',
  );
  if (to)
    return (
      <Link to={to} className={cls}>
        {icon}
        {label}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {label}
    </button>
  );
}

function SummaryTab({ patientId, settings }: { patientId: string; settings: ReturnType<typeof useSettings> }) {
  const tables = useTables();
  const p = tables.patients.get(patientId)!;
  const species = tables.species.get(p.speciesId);
  const problems = [...tables.diagnoses.values()].filter((d) => {
    if (d.patientId !== patientId || d.status === 'resolved' || d.kind === 'differential') return false;
    const c = tables.consultations.get(d.consultationId);
    return c && c.status !== 'voided';
  });
  const treatments = [...tables.treatments.values()].filter((tr) => tr.patientId === patientId && tr.status === 'active' && tables.consultations.get(tr.consultationId)?.status !== 'voided');
  const upcoming = [...preventiveDue(tables, settings, { patientId }), ...controlsDue(tables, settings, { patientId }), ...examsToReview(tables, { patientId })];
  const tasks = openTasks(tables, { patientId });
  const drafts = [...tables.consultations.values()].filter((c) => c.patientId === patientId && c.status === 'draft');
  const bg = p.background;
  const bgItems: Array<[string, string | undefined]> = [
    ['Enfermedades previas', bg.previousDiseases],
    ['Cirugías', bg.surgeries],
    ['Vacunación (antecedentes)', bg.vaccinationHistory],
    ['Desparasitación interna', bg.dewormingInternal],
    ['Desparasitación externa', bg.dewormingExternal],
    ['Alimentación', bg.diet],
    ['Hábitat', bg.habitat],
    ['Estilo de vida', bg.lifestyle],
    ['Conducta', bg.behavior],
    ['Familiares / epidemiológicos', bg.familyEpidemiological],
    ['Otros', bg.other],
  ];
  return (
    <div className="space-y-5">
      {drafts.length > 0 && (
        <Notice tone="warning" icon={<ClipboardList className="size-5" />} title="Consulta en borrador">
          {drafts.map((d) => (
            <Link key={d.id} to={`/consultas/${d.id}`} className="block font-semibold underline">
              {formatDateTime(d.startedAt)} · {d.reason.main || 'Sin motivo'} — continuar
            </Link>
          ))}
        </Notice>
      )}
      {upcoming.length > 0 && (
        <Section title="Próximos y pendientes">
          <List>
            {upcoming.map((u) => (
              <ListRow
                key={u.key}
                to={u.to}
                title={u.title}
                subtitle={u.subtitle}
                trailing={u.date ? <Badge tone={u.overdue ? 'danger' : 'brand'}>{relativeDays(u.date)}</Badge> : undefined}
              />
            ))}
          </List>
        </Section>
      )}
      <Section title="Problemas activos y crónicos">
        {problems.length === 0 ? (
          <p className="px-1 text-sm text-ink-500">Sin diagnósticos activos registrados.</p>
        ) : (
          <List>
            {problems.map((d) => (
              <ListRow key={d.id} to={`/consultas/${d.consultationId}`} title={d.name} subtitle={`${DX_KIND[d.kind]} · ${formatDate(tables.consultations.get(d.consultationId)?.startedAt)}`} trailing={<Badge tone={d.status === 'chronic' ? 'warning' : 'brand'}>{DX_STATUS[d.status]}</Badge>} />
            ))}
          </List>
        )}
      </Section>
      <Section title="Tratamientos en curso">
        {treatments.length === 0 ? (
          <p className="px-1 text-sm text-ink-500">Sin tratamientos en curso.</p>
        ) : (
          <List>
            {treatments.map((tr) => (
              <ListRow key={tr.id} to={`/consultas/${tr.consultationId}`} title={tr.name} subtitle={[tr.dose, tr.route, tr.frequency, tr.endDate && `hasta ${formatDate(tr.endDate)}`].filter(Boolean).join(' · ')} trailing={<Badge tone="info">{TREAT_STATUS[tr.status]}</Badge>} />
            ))}
          </List>
        )}
      </Section>
      {tasks.length > 0 && (
        <Section title="Tareas" action={<LinkButton to="/tareas" size="sm" variant="ghost" icon={<ListTodo className="size-4" />}>Ver todas</LinkButton>}>
          <List>
            {tasks.map((x) => (
              <ListRow key={x.key} to={x.to} title={x.title} subtitle={x.subtitle} trailing={x.date ? <Badge tone={x.overdue ? 'danger' : 'neutral'}>{formatDate(x.date)}</Badge> : undefined} />
            ))}
          </List>
        </Section>
      )}
      <Section title="Identificación">
        <Card>
          <dl className="divide-y divide-sand-100">
            <KeyValue label="Especie" value={species?.name} />
            <KeyValue label="Raza" value={p.breed} />
            <KeyValue label="Sexo" value={SEX[p.sex]} />
            <KeyValue label="Estado reproductivo" value={REPRO[p.reproductiveStatus]} />
            <KeyValue label="Nacimiento" value={p.birthDate ? `${formatDate(p.birthDate)}${p.birthDateEstimated ? ' (estimada)' : ''}` : undefined} />
            <KeyValue label="Color" value={p.color} />
            <KeyValue label="Señas" value={p.markings} />
            <KeyValue label="Microchip" value={p.microchip} />
            {species?.extraFields.map((ef) => (
              <KeyValue key={ef.key} label={ef.label} value={typeof p.extra[ef.key] === 'boolean' ? (p.extra[ef.key] ? 'Sí' : 'No') : (p.extra[ef.key] as string)} />
            ))}
            <KeyValue label="Observaciones" value={p.notes} />
            <KeyValue label="Registrado el" value={formatDate(p.createdAt)} />
          </dl>
        </Card>
      </Section>
      <Section title="Antecedentes" action={<LinkButton to={`/pacientes/${p.id}/antecedentes`} size="sm" variant="ghost">Editar</LinkButton>}>
        <Card>
          {bgItems.some(([, v]) => v) ? (
            <dl className="divide-y divide-sand-100">
              {bgItems.map(([k, v]) => (
                <KeyValue key={k} label={k} value={v} />
              ))}
            </dl>
          ) : (
            <p className="text-sm text-ink-500">Sin antecedentes registrados.</p>
          )}
        </Card>
      </Section>
      <div className="grid gap-2">
        <PdfButton make={() => pdf.patientHistory(p.id)} fileName={`ficha-${safeFileName(p.name)}.pdf`} label="Exportar ficha clínica (PDF)" block />
        <LinkButton to={`/finanzas/cobros/nuevo?patientId=${p.id}`} variant="secondary" icon={<Receipt className="size-4" />}>
          Registrar cobro
        </LinkButton>
      </div>
    </div>
  );
}

const KIND_FILTERS: Array<{ key: 'all' | TimelineKind; label: string }> = [
  { key: 'all', label: 'Todo' },
  { key: 'consultation', label: 'Consultas' },
  { key: 'vaccination', label: 'Vacunas' },
  { key: 'deworming', label: 'Desparasitaciones' },
  { key: 'exam', label: 'Exámenes' },
  { key: 'prescription', label: 'Recetas' },
  { key: 'document', label: 'Documentos' },
];

function HistoryTab({ patientId }: { patientId: string }) {
  const tables = useTables();
  const [kind, setKind] = useState<'all' | TimelineKind>('all');
  const events = useMemo(() => patientTimeline(tables, patientId), [tables, patientId]);
  const list = kind === 'all' ? events : events.filter((e) => e.kind === kind);
  return (
    <div className="space-y-3">
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5">
          {KIND_FILTERS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)} className={cn('min-h-9 rounded-full px-3 text-sm font-medium', kind === k.key ? 'bg-brand-700 text-white' : 'bg-white text-ink-700 ring-1 ring-sand-300')}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState title="Sin registros" icon={<ClipboardList className="size-6" />}>
          La cronología mostrará consultas, vacunas, exámenes, recetas y documentos.
        </EmptyState>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-sand-300 pl-4">
          {list.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="relative">
              <span className="absolute -left-[23px] top-4 size-3 rounded-full border-2 border-white bg-brand-600 ring-1 ring-brand-200" aria-hidden />
              <Link to={e.to} className="card block p-3 active:bg-sand-50">
                <p className="text-xs font-semibold text-ink-500">{e.date.length > 10 ? formatDateTime(e.date) : formatDate(e.date)}</p>
                <p className="font-semibold text-ink-900">{e.title}</p>
                {e.subtitle && <p className="text-sm text-ink-600">{e.subtitle}</p>}
                {e.status && e.kind === 'consultation' && (
                  <Badge className="mt-1" tone={e.status === 'final' ? 'success' : e.status === 'draft' ? 'warning' : 'danger'}>
                    {CONSULT_STATUS[e.status as keyof typeof CONSULT_STATUS]}
                  </Badge>
                )}
                {e.status === 'voided' && e.kind !== 'consultation' && (
                  <Badge className="mt-1" tone="danger">
                    Anulado
                  </Badge>
                )}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PreventiveTab({ patientId }: { patientId: string }) {
  const tables = useTables();
  const p = tables.patients.get(patientId)!;
  const vacs = [...tables.vaccinations.values()].filter((v) => v.patientId === patientId).sort((a, b) => b.date.localeCompare(a.date));
  const dews = [...tables.dewormings.values()].filter((d) => d.patientId === patientId).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-5">
      <Section
        title="Vacunas"
        action={
          <LinkButton to={`/vacunas/nueva?patientId=${patientId}`} size="sm" variant="ghost" icon={<Syringe className="size-4" />}>
            Registrar
          </LinkButton>
        }
      >
        {vacs.length === 0 ? (
          <p className="px-1 text-sm text-ink-500">Sin vacunas registradas en la app.</p>
        ) : (
          <List>
            {vacs.map((v) => (
              <ListRow
                key={v.id}
                to={`/vacunas/${v.id}`}
                title={v.vaccineName}
                subtitle={[formatDate(v.date), v.lotNumber && `Lote ${v.lotNumber}`, v.nextDueDate && `Próxima: ${formatDate(v.nextDueDate)}`].filter(Boolean).join(' · ')}
                trailing={v.status === 'voided' ? <Badge tone="danger">Anulada</Badge> : undefined}
              />
            ))}
          </List>
        )}
        {vacs.some((v) => v.status === 'applied') && (
          <PdfButton make={() => pdf.vaccineCertificate(patientId)} fileName={`certificado-vacunas-${safeFileName(p.name)}.pdf`} label="Certificado de vacunación (PDF)" icon={<ShieldCheck className="size-4" />} block />
        )}
      </Section>
      <Section
        title="Desparasitaciones"
        action={
          <LinkButton to={`/desparasitaciones/nueva?patientId=${patientId}`} size="sm" variant="ghost" icon={<Bug className="size-4" />}>
            Registrar
          </LinkButton>
        }
      >
        {dews.length === 0 ? (
          <p className="px-1 text-sm text-ink-500">Sin desparasitaciones registradas en la app.</p>
        ) : (
          <List>
            {dews.map((d) => (
              <ListRow
                key={d.id}
                to={`/desparasitaciones/${d.id}`}
                title={`${d.product} (${DEWORM_KIND[d.kind].toLowerCase()})`}
                subtitle={[formatDate(d.date), d.weightKgUsed && `${formatDecimal(d.weightKgUsed)} kg`, d.nextDueDate && `Próxima: ${formatDate(d.nextDueDate)}`].filter(Boolean).join(' · ')}
                trailing={d.status === 'voided' ? <Badge tone="danger">Anulada</Badge> : undefined}
              />
            ))}
          </List>
        )}
      </Section>
    </div>
  );
}

function ExamsTab({ patientId }: { patientId: string }) {
  const tables = useTables();
  const exams = useMemo(() => [...tables.exams.values()].filter((e) => e.patientId === patientId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)), [tables.exams, patientId]);
  const withValues = exams.some((e) => e.values?.length);
  const [view, setView] = useState<'list' | 'trends'>('list');
  return (
    <Section
      title="Exámenes"
      action={
        <LinkButton to={`/examenes/nuevo?patientId=${patientId}`} size="sm" variant="ghost" icon={<FlaskConical className="size-4" />}>
          Nuevo
        </LinkButton>
      }
    >
      {withValues && (
        <Segmented
          name="Vista de exámenes"
          value={view}
          onChange={setView}
          options={[
            { value: 'list', label: 'Lista' },
            { value: 'trends', label: 'Evolución de valores' },
          ]}
        />
      )}
      {view === 'trends' && withValues ? (
        <div className="mt-3">
          <LabTrends exams={exams} />
        </div>
      ) : exams.length === 0 ? (
        <p className="px-1 text-sm text-ink-500">Sin exámenes registrados.</p>
      ) : (
        <List className={withValues ? 'mt-3' : undefined}>
          {exams.map((e) => {
            const vals = (e.values ?? []).filter((v) => v.value !== undefined || v.text);
            const out = vals.filter((v) => (v.refLow !== undefined && v.value !== undefined && v.value < v.refLow) || (v.refHigh !== undefined && v.value !== undefined && v.value > v.refHigh)).length;
            return (
              <ListRow
                key={e.id}
                to={`/examenes/${e.id}`}
                title={e.name || EXAM_TYPE[e.type]}
                subtitle={[formatDate(e.requestedAt), e.lab, vals.length ? `${vals.length} valor${vals.length === 1 ? '' : 'es'}${out ? ` · ${out} fuera de rango` : ''}` : ''].filter(Boolean).join(' · ')}
                trailing={<Badge tone={EXAM_STATUS_TONE[e.status]}>{EXAM_STATUS[e.status]}</Badge>}
              />
            );
          })}
        </List>
      )}
    </Section>
  );
}

function PrescriptionsTab({ patientId }: { patientId: string }) {
  const tables = useTables();
  const list = [...tables.prescriptions.values()].filter((r) => r.patientId === patientId).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Section
      title="Recetas"
      action={
        <LinkButton to={`/recetas/nueva?patientId=${patientId}`} size="sm" variant="ghost" icon={<Pill className="size-4" />}>
          Nueva
        </LinkButton>
      }
    >
      {list.length === 0 ? (
        <p className="px-1 text-sm text-ink-500">Sin recetas.</p>
      ) : (
        <List>
          {list.map((r) => (
            <ListRow
              key={r.id}
              to={`/recetas/${r.id}`}
              title={r.items.map((i) => i.medicationName).join(', ') || 'Receta sin medicamentos'}
              subtitle={formatDate(r.date)}
              trailing={<Badge tone={r.status === 'issued' ? 'success' : r.status === 'draft' ? 'warning' : 'danger'}>{r.status === 'issued' ? 'Emitida' : r.status === 'draft' ? 'Borrador' : 'Anulada'}</Badge>}
            />
          ))}
        </List>
      )}
    </Section>
  );
}

function FilesTab({ patientId }: { patientId: string }) {
  const tables = useTables();
  const items = [...tables.attachments.values()].filter((a) => a.patientId === patientId);
  const photos = items.filter((a) => a.mimeType.startsWith('image/'));
  const docs = items.filter((a) => !a.mimeType.startsWith('image/'));
  return (
    <div className="space-y-5">
      <Section title="Agregar">
        <AttachmentPicker base={{ ownerKind: 'patient', patientId }} label="Elegir archivo o foto" />
        <p className="px-1 text-xs text-ink-500">Las fotos se guardan cifradas en el dispositivo, sin ubicación GPS.</p>
      </Section>
      <Section title={`Fotos (${photos.length})`} description="Ordenadas de la más reciente a la más antigua, útiles para comparar evolución.">
        <AttachmentGrid items={photos} emptyText="Sin fotos." />
      </Section>
      <Section title={`Documentos (${docs.length})`}>
        <AttachmentGrid items={docs} emptyText="Sin documentos." />
      </Section>
    </div>
  );
}

function WeightTab({ patientId, onAdd }: { patientId: string; onAdd: () => void }) {
  const tables = useTables();
  const list = weightHistory(tables, patientId);
  return (
    <Section
      title="Historial de peso (kg)"
      action={
        <button type="button" onClick={onAdd} className="min-h-9 rounded-lg px-3 text-sm font-semibold text-brand-700">
          + Registrar
        </button>
      }
    >
      {list.length === 0 ? (
        <p className="px-1 text-sm text-ink-500">Sin pesos registrados.</p>
      ) : (
        <>
          <WeightChart points={[...list].reverse().map((w) => ({ date: w.date, kg: w.weightKg }))} />
          <List>
            {list.map((w, i) => {
              const prev = list[i + 1];
              const delta = prev ? w.weightKg - prev.weightKg : null;
              return (
                <ListRow
                  key={w.id}
                  title={`${formatDecimal(w.weightKg)} kg`}
                  subtitle={`${formatDate(w.date)} · ${w.source === 'consultation' ? 'En consulta' : w.source === 'owner' ? 'Informado por el tutor' : 'Registrado'}`}
                  trailing={delta !== null && delta !== 0 ? <span className={delta > 0 ? 'text-amber-700' : 'text-sky-700'}>{delta > 0 ? '+' : ''}{formatDecimal(delta)} kg</span> : undefined}
                  chevron={false}
                />
              );
            })}
          </List>
        </>
      )}
    </Section>
  );
}

function WeightChart({ points }: { points: Array<{ date: string; kg: number }> }) {
  if (points.length < 2) return null;
  const w = 320;
  const h = 110;
  const pad = 18;
  const min = Math.min(...points.map((p) => p.kg));
  const max = Math.max(...points.map((p) => p.kg));
  const span = max - min || 1;
  const xy = points.map((p, i) => [pad + (i * (w - pad * 2)) / (points.length - 1), h - pad - ((p.kg - min) / span) * (h - pad * 2)] as const);
  return (
    <Card padded={false} className="p-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`Evolución del peso de ${formatDecimal(points[0].kg)} a ${formatDecimal(points[points.length - 1].kg)} kg`}>
        <polyline points={xy.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#256d62" strokeWidth="2.5" strokeLinejoin="round" />
        {xy.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.5" fill="#fff" stroke="#256d62" strokeWidth="2" />
        ))}
        <text x={pad} y={12} fontSize="10" fill="#69736f">
          máx. {formatDecimal(max)} kg
        </text>
        <text x={pad} y={h - 3} fontSize="10" fill="#69736f">
          mín. {formatDecimal(min)} kg
        </text>
      </svg>
    </Card>
  );
}
