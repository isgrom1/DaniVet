import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Check, CheckCheck, ChevronDown, CircleAlert, CloudOff, Copy, Loader2, Lock, Mic, Sparkles } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Card';
import { confirmDialog, promptDialog, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { CONSULT_KIND } from '@/data/labels';
import { formatDateTime, formatTime } from '@/lib/dates';
import { nowISO } from '@/lib/ids';
import { setPath } from '@/lib/objects';
import { registerFlush } from '@/lib/flush';
import { cn } from '@/lib/cn';
import { AlertsPanel } from '@/features/patients/AlertsPanel';
import { patientAlerts } from '@/features/patients/selectors';
import { amendConsultation, finalizeConsultation, saveConsultationDraft, voidConsultation, type EditorState } from './actions';
import { EditorCtx, type EditorApi } from './editorContext';
import { AnamnesisSection, AssessmentSection, ClosingSection, ExamSection, FollowUpSection, PlanSection, ReasonSection } from './EditorSections';
import { CopyFromPreviousSheet, TemplateSheet } from './ReuseSheets';
import { DictationSheet } from '@/features/voice/DictationSheet';
import { applyDictation } from '@/features/voice/apply';
import type { ParsedItem } from '@/features/voice/consultation';
import { finalizeBlockers, missingImportant, reviewDictatedOnEdit, type MissingItem } from './model';

type SaveStatus = { kind: 'saved' | 'saving' | 'dirty' | 'error'; at?: string; error?: string };

export function ConsultationEditor({ consultationId, mode }: { consultationId: string; mode: 'draft' | 'amend' }) {
  const tables = useTables();
  const navigate = useNavigate();
  const stored = tables.consultations.get(consultationId)!;
  const patient = tables.patients.get(stored.patientId);
  const species = patient ? tables.species.get(patient.speciesId) : undefined;

  const [state, setState] = useState<EditorState>(() => ({
    consultation: structuredClone(stored),
    diagnoses: [...tables.diagnoses.values()].filter((d) => d.consultationId === consultationId).map((d) => structuredClone(d)),
    treatments: [...tables.treatments.values()].filter((t) => t.consultationId === consultationId).map((t) => structuredClone(t)),
  }));
  const [status, setStatus] = useState<SaveStatus>({ kind: 'saved', at: stored.updatedAt });
  const [open, setOpen] = useState<Record<string, boolean>>({ reason: true, followup: true });
  const [copyOpen, setCopyOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [dictOpen, setDictOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const latest = useRef(state);
  latest.current = state;
  const dirty = useRef(false);
  const inflight = useRef<Promise<void> | null>(null);

  const save = useCallback(async () => {
    if (mode !== 'draft') return;
    if (inflight.current) await inflight.current;
    if (!dirty.current) return;
    dirty.current = false;
    setStatus({ kind: 'saving' });
    const p = saveConsultationDraft(latest.current)
      .then(() => setStatus({ kind: 'saved', at: nowISO() }))
      .catch((e) => {
        dirty.current = true;
        setStatus({ kind: 'error', error: friendlyError(e) });
      });
    inflight.current = p;
    await p;
    inflight.current = null;
  }, [mode]);

  useEffect(() => {
    if (!dirty.current || mode !== 'draft') return;
    setStatus((s) => (s.kind === 'saving' ? s : { kind: 'dirty' }));
    const t = setTimeout(() => void save(), 1000);
    return () => clearTimeout(t);
  }, [state, save, mode]);
  useEffect(() => registerFlush(save), [save]);
  useEffect(() => () => void save(), [save]);

  const change = useCallback((fn: (s: EditorState) => EditorState) => {
    dirty.current = true;
    setState(fn);
  }, []);
  const setC = useCallback(
    (path: string, value: unknown) => change((s) => ({ ...s, consultation: reviewDictatedOnEdit(setPath(s.consultation, path, value), path) })),
    [change],
  );
  const markReviewed = useCallback(
    (path: string) => change((s) => ({ ...s, consultation: { ...s.consultation, provenance: s.consultation.provenance.map((p) => (p.path === path ? { ...p, reviewed: true } : p)) } })),
    [change],
  );

  const api: EditorApi | null = useMemo(
    () => (patient ? { state, c: state.consultation, patient, species, mode, change, setC, markReviewed } : null),
    [state, patient, species, mode, change, setC, markReviewed],
  );

  if (!patient || !api) {
    return (
      <>
        <PageHeader title="Consulta" back="/" />
        <Page>
          <Notice tone="warning">No se encontró el paciente de esta consulta.</Notice>
        </Page>
      </>
    );
  }
  const c = state.consultation;
  const blockers = finalizeBlockers(c);
  const abnormalWithoutNotes = Object.entries(c.exam.systems).filter(([, f]) => f?.status === 'abnormal' && !f.notes?.trim()).length;
  const missing = missingImportant(c, state.diagnoses, state.treatments);
  const unreviewed = c.provenance.filter((p) => !p.reviewed);
  const unreviewedDictated = unreviewed.filter((p) => p.source === 'dictated').length;
  const bcsScale = species?.bcsScale ?? c.exam.bcs.scale ?? 9;

  const openSection = (key: string) => {
    setOpen((o) => ({ ...o, [key]: true }));
    setTimeout(() => document.getElementById(`sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  const applyDictated = (items: ParsedItem[], text: string) => {
    const r = applyDictation(latest.current, items, text);
    change(() => r.state);
    setDictOpen(false);
    setOpen((o) => ({ ...o, ...Object.fromEntries(items.filter((i) => i.selected).map((i) => [i.section, true])) }));
    toast.success(r.paths.length ? `${r.paths.length} dato(s) agregados. Quedan marcados «Dictado: revisar».` : 'Texto dictado guardado en la consulta.');
  };

  const reviewAllDictated = async () => {
    const ok = await confirmDialog({
      title: 'Marcar lo dictado como revisado',
      message: `¿Revisaste los ${unreviewedDictated} dato(s) dictados en la ficha? Quedarán como revisados.`,
      confirmLabel: 'Sí, los revisé',
    });
    if (ok) change((s) => ({ ...s, consultation: { ...s.consultation, provenance: s.consultation.provenance.map((p) => (p.source === 'dictated' ? { ...p, reviewed: true } : p)) } }));
  };

  const applyReuse = (source: 'copied' | 'template', fromId: string, values: Record<string, string>) => {
    change((s) => {
      let cons = s.consultation;
      for (const [path, val] of Object.entries(values)) cons = setPath(cons, path, val);
      const prov = cons.provenance.filter((p) => values[p.path] === undefined);
      for (const path of Object.keys(values)) prov.push({ path, source, fromId, reviewed: false });
      return { ...s, consultation: { ...cons, provenance: prov } };
    });
    toast.info(`${Object.keys(values).length} campo(s) completado(s). Revísalos y márcalos como revisados.`);
  };

  const finalize = async () => {
    await save();
    const current = latest.current;
    const b = finalizeBlockers(current.consultation);
    if (b.length) {
      toast.error(b.join(' '));
      return;
    }
    const emptyDx = current.diagnoses.some((d) => !d.name.trim()) || current.treatments.some((t) => !t.name.trim());
    if (emptyDx) {
      toast.error('Hay diagnósticos o tratamientos sin nombre. Complétalos o quítalos.');
      return;
    }
    const stillMissing = missingImportant(current.consultation, current.diagnoses, current.treatments);
    const ok = await confirmDialog({
      title: 'Finalizar consulta',
      message: (
        <>
          <p>La ficha quedará cerrada. Las correcciones posteriores se registrarán como enmiendas, con motivo y conservando la versión anterior.</p>
          {abnormalWithoutNotes > 0 && <p className="font-semibold text-amber-800">Hay {abnormalWithoutNotes} sistema(s) marcados como alterados sin descripción.</p>}
          {stillMissing.length > 0 && (
            <p className="font-semibold text-amber-800">Datos importantes sin registrar: {stillMissing.map((m) => m.label).join(', ')}.</p>
          )}
        </>
      ),
      confirmLabel: 'Finalizar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await finalizeConsultation(current);
      toast.success('Consulta finalizada');
      const appt = c.appointmentId ? tables.appointments.get(c.appointmentId) : undefined;
      if (appt && appt.status === 'in_progress') {
        const others = appt.consultationIds.filter((id) => id !== c.id).map((id) => tables.consultations.get(id));
        if (others.every((o) => !o || o.status !== 'draft')) {
          const done = await confirmDialog({ title: 'Visita', message: '¿Marcar la visita como completada?', confirmLabel: 'Sí, completada', cancelLabel: 'Todavía no' });
          if (done) await update('appointments', appt.id, (cur) => ({ ...cur, status: 'completed', statusLog: [...cur.statusLog, { status: 'completed', at: nowISO() }] }));
        }
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveAmend = async () => {
    const reason = await promptDialog({
      title: 'Guardar corrección',
      message: 'La versión anterior se conservará en el historial de la consulta.',
      label: 'Motivo de la corrección',
      multiline: true,
      confirmLabel: 'Guardar corrección',
    });
    if (!reason) return;
    setBusy(true);
    try {
      await amendConsultation(latest.current, reason);
      toast.success('Corrección guardada');
      navigate(`/consultas/${c.id}`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const discardDraft = async () => {
    const reason = await promptDialog({
      title: 'Anular borrador',
      message: 'El borrador se conservará como “anulado” para mantener la trazabilidad.',
      label: 'Motivo',
      confirmLabel: 'Anular',
    });
    if (!reason) return;
    try {
      await save();
      await voidConsultation(c.id, reason);
      toast.success('Borrador anulado');
      navigate(`/pacientes/${patient.id}`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const sections: Array<{ key: string; title: string; filled: boolean; body: ReactNode; hidden?: boolean }> = [
    { key: 'followup', title: 'Seguimiento del control', filled: !!c.followUp && Object.values(c.followUp).some(Boolean), body: <FollowUpSection />, hidden: c.kind !== 'control' },
    { key: 'reason', title: '1. Motivo de consulta', filled: !!c.reason.main?.trim(), body: <ReasonSection /> },
    { key: 'anamnesis', title: '2. Anamnesis', filled: Object.entries(c.anamnesis).some(([k, v]) => (k === 'custom' ? (v as unknown[]).length > 0 : !!v)), body: <AnamnesisSection /> },
    {
      key: 'exam',
      title: '3. Examen físico',
      filled: c.exam.weightKg !== undefined || c.exam.temperatureC !== undefined || Object.values(c.exam.systems).some((f) => f && f.status !== 'not_evaluated'),
      body: <ExamSection />,
    },
    { key: 'assessment', title: '4. Evaluación clínica', filled: state.diagnoses.length > 0 || c.assessment.problems.length > 0, body: <AssessmentSection /> },
    { key: 'plan', title: '5. Plan de manejo', filled: state.treatments.length > 0 || !!c.plan.homeCare || !!c.plan.controlDate, body: <PlanSection /> },
    { key: 'closing', title: '6. Cierre: adjuntos, registros y tareas', filled: false, body: <ClosingSection /> },
  ];

  return (
    <EditorCtx.Provider value={api}>
      <PageHeader
        title={patient.name}
        subtitle={`${CONSULT_KIND[c.kind]} · ${formatDateTime(c.startedAt)}`}
        back={`/pacientes/${patient.id}`}
        actions={mode === 'draft' ? <SaveIndicator s={status} /> : <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900"><Lock className="size-3" />Enmienda</span>}
      />
      <Page className="space-y-4">
        {mode === 'amend' && (
          <Notice tone="warning" title="Corrección de una consulta finalizada">
            Los cambios se guardarán como una nueva versión (v{stored.version + 1}) indicando el motivo. La versión actual quedará en el historial.
          </Notice>
        )}
        <AlertsPanel alerts={patientAlerts(patient, tables)} compact editTo={`/pacientes/${patient.id}/antecedentes`} />
        {mode === 'draft' && (
          <Button block variant="soft" icon={<Mic className="size-5" />} onClick={() => setDictOpen(true)}>
            Dictar la consulta
          </Button>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Copy className="size-4" />} onClick={() => setCopyOpen(true)}>
            Copiar de consulta anterior
          </Button>
          <Button size="sm" variant="secondary" icon={<Sparkles className="size-4" />} onClick={() => setTplOpen(true)}>
            Usar plantilla
          </Button>
        </div>
        {unreviewed.length > 0 && (
          <Notice tone="warning" icon={<CircleAlert className="size-5" />}>
            <p>Hay {unreviewed.length} campo(s) reutilizados o dictados sin revisar. Debes revisarlos antes de finalizar.</p>
            {unreviewedDictated > 0 && (
              <Button size="sm" variant="secondary" className="mt-2 min-h-11" icon={<CheckCheck className="size-4" />} onClick={reviewAllDictated}>
                Marcar lo dictado como revisado ({unreviewedDictated})
              </Button>
            )}
          </Notice>
        )}
        {mode === 'draft' && missing.length > 0 && <MissingPanel missing={missing} onGo={openSection} />}

        <nav className="-mx-4 overflow-x-auto px-4" aria-label="Secciones de la consulta">
          <div className="flex w-max gap-1.5">
            {sections
              .filter((s) => !s.hidden)
              .map((s) => (
                <a
                  key={s.key}
                  href={`#sec-${s.key}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpen((o) => ({ ...o, [s.key]: true }));
                    setTimeout(() => document.getElementById(`sec-${s.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
                  }}
                  className={cn('flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-medium', s.filled ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-200' : 'bg-white text-ink-600 ring-1 ring-sand-300')}
                >
                  {s.filled && <Check className="size-3.5" />}
                  {s.title.replace(/^\d\.\s/, '').split(':')[0]}
                </a>
              ))}
          </div>
        </nav>

        {sections
          .filter((s) => !s.hidden)
          .map((s) => (
            <section key={s.key} id={`sec-${s.key}`} className="card scroll-mt-20 overflow-hidden">
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-2 px-4 text-left"
                aria-expanded={!!open[s.key]}
                onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}
              >
                <span className="flex items-center gap-2 text-[16px] font-semibold text-ink-900">
                  {s.title}
                  {s.filled && <Check className="size-4 text-brand-600" aria-label="Con datos" />}
                </span>
                <ChevronDown className={cn('size-5 text-ink-400 transition-transform', open[s.key] && 'rotate-180')} />
              </button>
              {open[s.key] && <div className="border-t border-sand-200 px-4 py-4">{s.body}</div>}
            </section>
          ))}

        {mode === 'draft' && blockers.length > 0 && (
          <Notice tone="neutral" title="Para finalizar falta:">
            <ul className="list-disc pl-5">
              {blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </Notice>
        )}
        {mode === 'draft' && (
          <Button variant="ghost" className="text-red-700" icon={<Ban className="size-4" />} onClick={discardDraft}>
            Anular borrador
          </Button>
        )}
      </Page>
      <StickyActions>
        {mode === 'draft' ? (
          <>
            <Button variant="secondary" onClick={async () => { await save(); toast.success('Borrador guardado en este dispositivo'); }}>
              Guardar borrador
            </Button>
            <Button block loading={busy} onClick={finalize} disabled={blockers.length > 0}>
              Finalizar consulta
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => navigate(`/consultas/${c.id}`, { replace: true })}>
              Cancelar
            </Button>
            <Button block loading={busy} onClick={saveAmend}>
              Guardar corrección
            </Button>
          </>
        )}
      </StickyActions>
      {copyOpen && (
        <CopyFromPreviousSheet
          current={c}
          onClose={() => setCopyOpen(false)}
          onCopy={(fromId, values) => {
            applyReuse('copied', fromId, values);
            setCopyOpen(false);
            setOpen((o) => ({ ...o, reason: true, anamnesis: true }));
          }}
        />
      )}
      {dictOpen && <DictationSheet state={state} bcsScale={bcsScale} onClose={() => setDictOpen(false)} onApply={applyDictated} />}
      {tplOpen && (
        <TemplateSheet
          current={c}
          onClose={() => setTplOpen(false)}
          onApply={(tid, values) => {
            applyReuse('template', tid, values);
            setTplOpen(false);
            setOpen((o) => ({ ...o, reason: true, anamnesis: true, plan: true }));
          }}
        />
      )}
    </EditorCtx.Provider>
  );
}

/** Datos importantes aún sin registrar (aviso; no impide finalizar). Cada uno lleva a su sección. */
function MissingPanel({ missing, onGo }: { missing: MissingItem[]; onGo: (section: string) => void }) {
  // Al comenzar faltan casi todos: se muestra plegado para no tapar la ficha.
  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50 px-3" aria-label="Datos importantes sin registrar">
      <details open={missing.length <= 6}>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-semibold text-sky-900">
          Datos importantes sin registrar ({missing.length})
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </summary>
        <div className="flex flex-wrap gap-1.5 pb-3">
          {missing.map((m) => (
            <button key={m.label} type="button" onClick={() => onGo(m.section)} className="min-h-11 rounded-full bg-white px-3 text-sm font-medium text-sky-900 ring-1 ring-sky-200 active:bg-sky-100">
              {m.label}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}

function SaveIndicator({ s }: { s: SaveStatus }) {
  if (s.kind === 'saving')
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-ink-500" role="status">
        <Loader2 className="size-3.5 animate-spin" /> Guardando…
      </span>
    );
  if (s.kind === 'dirty')
    return (
      <span className="text-xs font-semibold text-ink-500" role="status">
        Cambios sin guardar
      </span>
    );
  if (s.kind === 'error')
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-red-700" role="alert" title={s.error}>
        <CloudOff className="size-3.5" /> No se guardó
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700" role="status" data-testid="save-status">
      <Check className="size-3.5" /> Guardado{s.at ? ` ${formatTime(s.at)}` : ''}
    </span>
  );
}
