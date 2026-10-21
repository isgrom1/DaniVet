import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardPaste, ListPlus, Mic, Plus, ScanText, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { List, ListRow, Notice } from '@/components/Card';
import { Checkbox, Field, SearchInput, TextArea, TextInput } from '@/components/form';
import { Sheet } from '@/components/overlay';
import type { Exam, LabValue, Settings } from '@/data/schema';
import { formatDate } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { formatDecimal, parseDecimal } from '@/lib/numbers';
import { fold } from '@/features/voice/text';
import { parseLabDictation, type ParsedLabValue } from '@/features/voice/labs';
import { useAiConfig, type AiConfig } from '@/features/ai/aiKey';
import { AiReportPanel, PickReportButton } from '@/features/ai/AiReportPanel';
import { ANALYTES, PANEL_LABEL, PANELS, QUALITATIVE_OPTIONS, analyteDef, customCode, flagOf, panelForExamType, panelOf, searchAnalytes, type AnalyteDef, type PanelKey } from './analytes';
import { deltaOf, previousValue } from './trends';

/** Fila del formulario (texto tal como se escribe; se convierte al guardar). */
export interface ValueRow {
  id: string;
  analyte: string;
  name: string;
  value: string;
  text: string;
  unit: string;
  refLow: string;
  refHigh: string;
  note: string;
  /** El rango vino de un informe anterior del mismo laboratorio. */
  rangeSaved?: boolean;
}

const num = (n: number | undefined, digits = 3) => (n === undefined ? '' : formatDecimal(n, digits));

export function rowsFromValues(values: LabValue[] | undefined): ValueRow[] {
  return (values ?? []).map((v) => ({
    id: v.id,
    analyte: v.analyte,
    name: v.name,
    value: num(v.value, 6),
    text: v.text ?? '',
    unit: v.unit ?? '',
    refLow: num(v.refLow, 6),
    refHigh: num(v.refHigh, 6),
    note: v.note ?? '',
  }));
}

/** Convierte las filas en valores guardables. Las filas sin valor se descartan. */
export function valuesFromRows(rows: ValueRow[]): { values: LabValue[]; errors: string[] } {
  const values: LabValue[] = [];
  const errors: string[] = [];
  for (const r of rows) {
    const hasValue = r.value.trim() !== '';
    const hasText = r.text.trim() !== '';
    if (!hasValue && !hasText) continue;
    const value = hasValue ? parseDecimal(r.value) : undefined;
    const low = r.refLow.trim() ? parseDecimal(r.refLow) : undefined;
    const high = r.refHigh.trim() ? parseDecimal(r.refHigh) : undefined;
    if (value === null) errors.push(`${r.name}: el valor no es un número.`);
    if (low === null || high === null) errors.push(`${r.name}: el rango de referencia no es un número.`);
    if (low != null && high != null && low > high) errors.push(`${r.name}: el mínimo del rango es mayor que el máximo.`);
    if (value === null || low === null || high === null) continue;
    values.push({
      id: r.id,
      analyte: r.analyte,
      name: r.name,
      value: value ?? undefined,
      text: hasText ? r.text.trim() : undefined,
      unit: r.unit.trim() || undefined,
      refLow: low ?? undefined,
      refHigh: high ?? undefined,
      note: r.note.trim() || undefined,
    });
  }
  return { values, errors };
}

export const rangeKey = (speciesId: string, lab: string, analyte: string) => `${speciesId}|${fold(lab).trim()}|${analyte}`;

/** Rangos para recordar: los informados en este examen, por especie, laboratorio y analito. */
export function rangesToRemember(values: LabValue[], speciesId: string, lab: string): NonNullable<Settings['labRanges']> {
  const out: NonNullable<Settings['labRanges']> = {};
  for (const v of values) {
    if (v.refLow === undefined && v.refHigh === undefined) continue;
    out[rangeKey(speciesId, lab, v.analyte)] = { low: v.refLow, high: v.refHigh, unit: v.unit };
  }
  return out;
}

interface Ctx {
  speciesId?: string;
  lab: string;
  saved?: Settings['labRanges'];
}

function savedRange(ctx: Ctx, analyte: string, unit: string) {
  if (!ctx.speciesId || !ctx.saved) return undefined;
  const r = ctx.saved[rangeKey(ctx.speciesId, ctx.lab, analyte)];
  return r && (r.unit ?? '') === unit ? r : undefined;
}

function rowFor(def: AnalyteDef | { code: string; name: string; unit: string }, ctx: Ctx): ValueRow {
  const r = savedRange(ctx, def.code, def.unit);
  return {
    id: newId(),
    analyte: def.code,
    name: def.name,
    value: '',
    text: '',
    unit: def.unit,
    refLow: num(r?.low, 6),
    refHigh: num(r?.high, 6),
    note: '',
    rangeSaved: !!r && (r.low !== undefined || r.high !== undefined),
  };
}

/**
 * Valores del examen: se ingresan desde el informe (o se dictan), con el rango de referencia que informa
 * el laboratorio. Muestra el valor anterior del paciente y la diferencia.
 */
export function LabValuesEditor({
  rows,
  onChange,
  examType,
  examId,
  examDate,
  exams,
  speciesId,
  lab,
  saved,
  status,
}: {
  rows: ValueRow[];
  onChange: (rows: ValueRow[]) => void;
  examType: Exam['type'];
  examId?: string;
  examDate: string;
  /** Exámenes del paciente (para el valor anterior). */
  exams: Exam[];
  speciesId?: string;
  lab: string;
  saved?: Settings['labRanges'];
  status: Exam['status'];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [dictOpen, setDictOpen] = useState(false);
  /** Fotos o PDF elegidos con "Leer foto o PDF con IA" (abren la hoja de dictado en modo lectura). */
  const [aiFiles, setAiFiles] = useState<File[]>();
  const ai = useAiConfig();
  const ctx: Ctx = { speciesId, lab, saved };
  const suggested = panelForExamType(examType);
  const present = new Set(rows.map((r) => r.analyte));
  const set = (id: string, patch: Partial<ValueRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addPanel = (p: PanelKey) => onChange([...rows, ...ANALYTES.filter((a) => a.panel === p && !present.has(a.code)).map((a) => rowFor(a, ctx))]);
  const fillable = rows.filter((r) => !r.refLow && !r.refHigh && savedRange(ctx, r.analyte, r.unit));
  const withValues = rows.filter((r) => r.value.trim() || r.text.trim()).length;
  const groups = [...PANELS, 'other' as const].map((p) => ({ p, list: rows.filter((r) => panelOf(r.analyte) === p) })).filter((g) => g.list.length);

  const applyDictated = (vals: ParsedLabValue[]) => {
    let next = [...rows];
    for (const v of vals) {
      const def = analyteDef(v.code);
      const idx = next.findIndex((r) => r.analyte === v.code);
      const base = idx >= 0 ? next[idx] : rowFor(def ?? { code: v.code, name: v.name, unit: v.unit }, { ...ctx });
      const unitChanged = base.unit !== v.unit;
      const hasRange = v.refLow !== undefined || v.refHigh !== undefined;
      const r = unitChanged ? savedRange(ctx, v.code, v.unit) : undefined;
      const row: ValueRow = {
        ...base,
        value: v.value !== undefined ? num(v.value, 6) : base.value,
        text: v.text ?? base.text,
        unit: v.unit,
        // Si el dictado o el informe trae rango, se usa completo (no se mezcla con un rango guardado).
        refLow: hasRange ? num(v.refLow, 6) : unitChanged ? num(r?.low, 6) : base.refLow,
        refHigh: hasRange ? num(v.refHigh, 6) : unitChanged ? num(r?.high, 6) : base.refHigh,
        rangeSaved: hasRange ? false : unitChanged ? !!r : base.rangeSaved,
        note: [base.note, v.note].filter(Boolean).join('. '),
      };
      if (idx >= 0) next[idx] = row;
      else next = [...next, row];
    }
    onChange(next);
    setDictOpen(false);
    setAiFiles(undefined);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600">
        Registra los valores del informe para ver cómo cambian entre exámenes. El rango de referencia es el que informa el laboratorio: la app no trae rangos propios.
      </p>
      {rows.length === 0 && suggested && (
        <Button block variant="soft" icon={<ListPlus className="size-5" />} onClick={() => addPanel(suggested)}>
          Ingresar valores {suggested === 'hemogram' ? 'del hemograma' : suggested === 'biochemistry' ? 'de bioquímica' : 'de orina'}
        </Button>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Agregar panel de valores">
        {PANELS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => addPanel(p)}
            disabled={ANALYTES.filter((a) => a.panel === p).every((a) => present.has(a.code))}
            className="inline-flex min-h-11 items-center gap-1 rounded-full bg-white px-3 text-sm font-medium text-brand-800 ring-1 ring-sand-300 active:bg-sand-200 disabled:opacity-40"
          >
            <Plus className="size-3.5" aria-hidden /> {PANEL_LABEL[p]}
          </button>
        ))}
      </div>
      {ai && (
        <PickReportButton
          block
          variant="soft"
          icon={<ScanText className="size-5" />}
          onPick={(files) => {
            setAiFiles(files);
            setDictOpen(true);
          }}
        >
          Leer foto o PDF con IA
        </PickReportButton>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<Mic className="size-4" />} onClick={() => setDictOpen(true)}>
          Dictar o pegar
        </Button>
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>
          Otro valor
        </Button>
      </div>
      {fillable.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={() =>
            onChange(
              rows.map((r) => {
                if (r.refLow || r.refHigh) return r;
                const s = savedRange(ctx, r.analyte, r.unit);
                return s ? { ...r, refLow: num(s.low, 6), refHigh: num(s.high, 6), rangeSaved: true } : r;
              }),
            )
          }
        >
          Completar {fillable.length} rango(s) guardados de {lab.trim() || 'informes sin laboratorio'}
        </Button>
      )}

      {groups.map(({ p, list }) => (
        <div key={p} className="card divide-y divide-sand-100 px-3">
          <p className="py-2 text-[13px] font-semibold uppercase tracking-wide text-ink-500">{PANEL_LABEL[p]}</p>
          {list.map((r) => (
            <ValueRowEditor key={r.id} row={r} onChange={(patch) => set(r.id, patch)} onRemove={() => onChange(rows.filter((x) => x.id !== r.id))} exams={exams} examId={examId} examDate={examDate} />
          ))}
        </div>
      ))}
      {withValues > 0 && ['requested', 'sampled', 'sent'].includes(status) && (
        <Notice tone="neutral">Si ya tienes el informe, cambia el estado del examen a «Resultado recibido».</Notice>
      )}
      {addOpen && (
        <AddValueSheet
          present={present}
          onClose={() => setAddOpen(false)}
          onAdd={(def) => {
            onChange([...rows, rowFor(def, ctx)]);
            setAddOpen(false);
          }}
        />
      )}
      {dictOpen && (
        <LabDictationSheet
          rows={rows}
          ai={ai}
          initialFiles={aiFiles}
          onClose={() => {
            setDictOpen(false);
            setAiFiles(undefined);
          }}
          onApply={applyDictated}
        />
      )}
    </div>
  );
}

function ValueRowEditor({
  row,
  onChange,
  onRemove,
  exams,
  examId,
  examDate,
}: {
  row: ValueRow;
  onChange: (patch: Partial<ValueRow>) => void;
  onRemove: () => void;
  exams: Exam[];
  examId?: string;
  examDate: string;
}) {
  const def = analyteDef(row.analyte);
  const qualitative = !!def?.qualitative;
  const value = parseDecimal(row.value) ?? undefined;
  const low = parseDecimal(row.refLow) ?? undefined;
  const high = parseDecimal(row.refHigh) ?? undefined;
  const flag = flagOf(value, low, high);
  const invalid = row.value.trim() !== '' && parseDecimal(row.value) === null;
  const prev = useMemo(
    () => (qualitative ? null : previousValue(exams, { excludeExamId: examId, analyte: row.analyte, unit: row.unit, beforeOrOn: examDate })),
    [exams, examId, row.analyte, row.unit, examDate, qualitative],
  );
  const d = deltaOf(value, prev?.value);
  const digits = def?.digits ?? 2;
  const units = [...new Set([...(def?.units ?? [def?.unit ?? row.unit]), row.unit])];
  return (
    <div className="space-y-1.5 py-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_6rem_2.75rem] items-center gap-1.5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold text-ink-900">
            {row.name}
            {flag === 'high' && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 text-[12px] font-bold text-amber-900">
                <ArrowUp className="size-3" aria-hidden /> Alto
              </span>
            )}
            {flag === 'low' && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 text-[12px] font-bold text-sky-900">
                <ArrowDown className="size-3" aria-hidden /> Bajo
              </span>
            )}
          </p>
          {prev && (
            <p className="text-[12px] text-ink-500">
              Anterior {formatDecimal(prev.value, digits)} ({formatDate(prev.date)}){d && d.abs !== 0 ? ` · ${d.abs > 0 ? '+' : '−'}${formatDecimal(Math.abs(d.abs), digits)}` : d ? ' · sin cambio' : ''}
            </p>
          )}
        </div>
        {qualitative ? (
          <select className="input-base px-2" value={row.text} onChange={(e) => onChange({ text: e.target.value })} aria-label={`${row.name}: resultado`}>
            <option value="">—</option>
            {[...new Set([...QUALITATIVE_OPTIONS, ...(row.text ? [row.text] : [])])].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input-base px-2 text-right tabular-nums"
            inputMode="decimal"
            value={row.value}
            onChange={(e) => onChange({ value: e.target.value })}
            aria-label={`${row.name}: valor`}
            aria-invalid={invalid || undefined}
            autoComplete="off"
          />
        )}
        <button type="button" onClick={onRemove} aria-label={`Quitar ${row.name}`} className="flex size-11 items-center justify-center text-ink-400 active:text-red-700">
          <Trash2 className="size-4" />
        </button>
      </div>
      {!qualitative && (
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-600">
          {def ? (
            units.length > 1 ? (
              <select className="min-h-11 rounded-lg border border-sand-300 bg-white px-1.5" value={row.unit} onChange={(e) => onChange({ unit: e.target.value })} aria-label={`${row.name}: unidad`}>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u || 'sin unidad'}
                  </option>
                ))}
              </select>
            ) : (
              <span className="min-w-10">{row.unit || 'sin unidad'}</span>
            )
          ) : (
            <input className="min-h-11 w-20 rounded-lg border border-sand-300 bg-white px-1.5" value={row.unit} onChange={(e) => onChange({ unit: e.target.value })} placeholder="unidad" aria-label={`${row.name}: unidad`} />
          )}
          <span className="ml-1">Ref.</span>
          <input
            className="min-h-11 w-16 rounded-lg border border-sand-300 bg-white px-1.5 text-right tabular-nums"
            inputMode="decimal"
            value={row.refLow}
            onChange={(e) => onChange({ refLow: e.target.value, rangeSaved: false })}
            aria-label={`${row.name}: referencia mínima`}
            autoComplete="off"
          />
          <span aria-hidden>–</span>
          <input
            className="min-h-11 w-16 rounded-lg border border-sand-300 bg-white px-1.5 text-right tabular-nums"
            inputMode="decimal"
            value={row.refHigh}
            onChange={(e) => onChange({ refHigh: e.target.value, rangeSaved: false })}
            aria-label={`${row.name}: referencia máxima`}
            autoComplete="off"
          />
        </div>
      )}
      {row.rangeSaved && <p className="text-[12px] text-ink-500">Rango del último informe de este laboratorio: revisa que coincida con el actual.</p>}
      {invalid && <p className="text-[12px] font-semibold text-red-700">Escribe solo el número (ej.: 12,5).</p>}
      {row.note && (
        <TextInput className="py-1" value={row.note} onChange={(e) => onChange({ note: e.target.value })} aria-label={`${row.name}: nota`} />
      )}
    </div>
  );
}

function AddValueSheet({ present, onClose, onAdd }: { present: Set<string>; onClose: () => void; onAdd: (def: AnalyteDef | { code: string; name: string; unit: string }) => void }) {
  const [q, setQ] = useState('');
  const [unit, setUnit] = useState('');
  const list = searchAnalytes(q).filter((a) => !present.has(a.code));
  const exact = ANALYTES.some((a) => fold(a.name) === fold(q).trim());
  const name = q.trim();
  return (
    <Sheet open onClose={onClose} title="Agregar un valor" size="full">
      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar valor (ej.: creatinina, ALT)" autoFocus />
        {name && !exact && (
          <div className="card space-y-2 p-3">
            <p className="text-sm text-ink-600">¿No está en la lista? Agrégalo con el nombre del informe:</p>
            <Field label="Unidad (como aparece en el informe)">
              <TextInput value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="mg/dL, U/L…" />
            </Field>
            <Button block variant="soft" icon={<Plus className="size-4" />} onClick={() => onAdd({ code: customCode(name), name: name.charAt(0).toLocaleUpperCase('es-CL') + name.slice(1), unit: unit.trim() })} disabled={present.has(customCode(name))}>
              Agregar «{name}»
            </Button>
          </div>
        )}
        <List>
          {list.slice(0, 60).map((a) => (
            <ListRow key={a.code} onClick={() => onAdd(a)} title={a.name} subtitle={[PANEL_LABEL[a.panel], a.unit].filter(Boolean).join(' · ')} chevron={false} trailing={<Plus className="size-4" aria-hidden />} />
          ))}
        </List>
      </div>
    </Sheet>
  );
}

function LabDictationSheet({
  rows,
  ai,
  initialFiles,
  onClose,
  onApply,
}: {
  rows: ValueRow[];
  ai: AiConfig | null | undefined;
  initialFiles?: File[];
  onClose: () => void;
  onApply: (vals: ParsedLabValue[]) => void;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const [aiText, setAiText] = useState(false);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const parsed = useMemo(() => (text.trim() ? parseLabDictation(text) : { values: [], unplaced: [] }), [text]);
  // Si un valor aparece más de una vez (por ejemplo, al leer dos veces el mismo informe), vale el último.
  const values = useMemo(() => [...new Map(parsed.values.map((v) => [v.code, v])).values()], [parsed]);
  const chosen = values.filter((v) => !off[v.code]);
  const ref = (v: ParsedLabValue) =>
    v.refLow !== undefined && v.refHigh !== undefined
      ? ` (ref. ${formatDecimal(v.refLow, 6)}–${formatDecimal(v.refHigh, 6)})`
      : v.refHigh !== undefined
        ? ` (ref. hasta ${formatDecimal(v.refHigh, 6)})`
        : v.refLow !== undefined
          ? ` (ref. desde ${formatDecimal(v.refLow, 6)})`
          : '';
  const fmt = (v: ParsedLabValue) => `${v.text ?? formatDecimal(v.value, 6)}${v.unit && v.text === undefined ? ` ${v.unit}` : ''}${ref(v)}`;
  const MAX_UNPLACED = 8;
  return (
    <Sheet
      open
      onClose={onClose}
      title={initialFiles ? 'Leer informe con IA' : 'Dictar o pegar valores'}
      size="full"
      footer={
        <Button block size="lg" disabled={!chosen.length} onClick={() => onApply(chosen)}>
          {chosen.length ? `Agregar ${chosen.length} valor${chosen.length === 1 ? '' : 'es'}` : 'Agregar valores'}
        </Button>
      }
    >
      <div className="space-y-3">
        {ai && (
          <AiReportPanel
            config={ai}
            files={files}
            onFiles={setFiles}
            onLines={(lines) => {
              setText((t) => [t.trimEnd(), ...lines].filter(Boolean).join('\n'));
              setAiText(true);
            }}
          />
        )}
        <Notice tone="neutral" icon={<ClipboardPaste className="size-5" />}>
          <p>
            <strong>Dictar:</strong> usa el micrófono del teclado y di el nombre y luego el valor, por ejemplo: «hematocrito 45, hemoglobina 15,2, plaquetas 250 mil, creatinina 1,8 referencia 0,5 a 1,5».
          </p>
          <p className="mt-1.5">
            <strong>Informe en foto o PDF:</strong> ábrelo en el iPhone, mantén presionado el texto, toca «Seleccionar todo» y luego «Copiar», y pégalo aquí. Se toman el valor, la unidad y el rango de cada línea.
          </p>
          {ai === null && (
            <p className="mt-1.5">
              <strong>Con IA (opcional):</strong> si la activas en Más › Lectura de informes con IA, la app puede leer la foto o el PDF del informe por ti.
            </p>
          )}
        </Notice>
        <Field label="Valores dictados o pegados" hint={aiText ? 'Incluye el texto que leyó la IA: puedes corregirlo antes de agregar.' : undefined}>
          <TextArea value={text} onChange={(e) => setText(e.target.value)} minRows={5} placeholder="Toca aquí para dictar o pegar…" />
        </Field>
        {values.length > 0 && (
          <div className="card divide-y divide-sand-100 px-3">
            {values.map((v) => {
              const existing = rows.find((r) => r.analyte === v.code && (r.value.trim() || r.text.trim()));
              return (
                <Checkbox
                  key={v.code}
                  checked={!off[v.code]}
                  onChange={(c) => setOff((m) => ({ ...m, [v.code]: !c }))}
                  label={
                    <>
                      <span className="font-semibold">{v.name}:</span> {fmt(v)}
                    </>
                  }
                  description={
                    <>
                      <span className="block italic">«{v.source}»</span>
                      {existing && <span className="block">Reemplaza {existing.value || existing.text}</span>}
                      {v.note && <span className="block">Nota: {v.note}</span>}
                      {v.warning && <span className="block font-semibold text-amber-800">{v.warning}</span>}
                    </>
                  }
                />
              );
            })}
          </div>
        )}
        {parsed.unplaced.length > 0 && (
          <Notice tone="warning" title="No se reconoció">
            <ul className="list-disc pl-5">
              {parsed.unplaced.slice(0, MAX_UNPLACED).map((u, i) => (
                <li key={i}>«{u}»</li>
              ))}
            </ul>
            {parsed.unplaced.length > MAX_UNPLACED && <p className="mt-1">Y {parsed.unplaced.length - MAX_UNPLACED} línea(s) más.</p>}
            <p className="mt-1">Si es un valor, puedes agregarlo con «Otro valor».</p>
          </Notice>
        )}
      </div>
    </Sheet>
  );
}
