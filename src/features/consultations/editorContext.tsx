import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { CircleCheck } from 'lucide-react';
import { DecimalInput, Field, ProvenanceTag, TextArea } from '@/components/form';
import type { Consultation, Patient, Species } from '@/data/schema';
import { formatDecimal, parseDecimal } from '@/lib/numbers';
import { getPath } from '@/lib/objects';
import type { EditorState } from './actions';

export interface EditorApi {
  state: EditorState;
  c: Consultation;
  patient: Patient;
  species?: Species;
  mode: 'draft' | 'amend';
  change: (fn: (s: EditorState) => EditorState) => void;
  setC: (path: string, value: unknown) => void;
  markReviewed: (path: string) => void;
}

export const EditorCtx = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const ctx = useContext(EditorCtx);
  if (!ctx) throw new Error('EditorCtx no disponible');
  return ctx;
}

/** Etiqueta de origen para campos copiados o de plantilla, con botón para confirmar la revisión. */
export function ProvenanceFor({ path }: { path: string }) {
  const { c, markReviewed } = useEditor();
  const p = c.provenance.find((x) => x.path === path);
  if (!p) return null;
  if (p.reviewed) return <ProvenanceTag kind={p.source} label={p.source === 'copied' ? 'Copiado · revisado' : 'Plantilla · revisado'} />;
  return (
    <span className="inline-flex items-center gap-1">
      <ProvenanceTag kind={p.source} />
      <button type="button" onClick={() => markReviewed(path)} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-white px-2 text-[11px] font-bold text-brand-700 ring-1 ring-brand-200">
        <CircleCheck className="size-3" /> Marcar revisado
      </button>
    </span>
  );
}

/** Campo de texto de la consulta enlazado a una ruta del registro. */
export function CText({ path, label, hint, rows = 2, placeholder }: { path: string; label: string; hint?: ReactNode; rows?: number; placeholder?: string }) {
  const { c, setC } = useEditor();
  const value = (getPath(c, path) as string | undefined) ?? '';
  return (
    <Field label={label} hint={hint} tag={<ProvenanceFor path={path} />}>
      <TextArea value={value} onChange={(e) => setC(path, e.target.value)} minRows={rows} placeholder={placeholder} aria-label={label} />
    </Field>
  );
}

/** Campo numérico con unidad. Vacío = sin registrar (nunca se completa automáticamente). */
export function CNumber({
  path,
  label,
  unit,
  integer,
  range,
  hint,
  digits = 2,
}: {
  path: string;
  label: string;
  unit: string;
  integer?: boolean;
  range?: { min?: number; max?: number };
  hint?: ReactNode;
  digits?: number;
}) {
  const { c, setC } = useEditor();
  const value = getPath(c, path) as number | undefined;
  const [text, setText] = useState(value !== undefined ? formatDecimal(value, digits) : '');
  // Sincroniza el texto solo si el valor cambió desde fuera (p. ej. al restaurar un borrador).
  useEffect(() => {
    const p = parseDecimal(text);
    if (value === undefined) {
      if (p !== null) setText('');
    } else if (p !== value) setText(formatDecimal(value, digits));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const parsed = parseDecimal(text);
  const invalid = text !== '' && (parsed === null || parsed < 0 || (integer && !Number.isInteger(parsed)));
  const out =
    !invalid && parsed !== null && range && ((range.min !== undefined && parsed < range.min) || (range.max !== undefined && parsed > range.max));
  const refText = range && (range.min !== undefined || range.max !== undefined) ? `Ref. configurada: ${range.min ?? '…'}–${range.max ?? '…'} ${unit}` : undefined;
  return (
    <Field
      label={label}
      error={invalid ? `Valor no válido${integer ? ' (número entero)' : ''}` : null}
      hint={out ? <span className="font-semibold text-amber-800">Fuera del rango de referencia configurado ({range?.min ?? '…'}–{range?.max ?? '…'} {unit})</span> : (hint ?? refText ?? (value === undefined ? 'Sin registrar' : undefined))}
    >
      <DecimalInput
        value={text}
        unit={unit}
        invalid={invalid}
        aria-label={label}
        onChange={(v) => {
          setText(v);
          const n = parseDecimal(v);
          if (v.trim() === '') setC(path, undefined);
          else if (n !== null && n >= 0 && (!integer || Number.isInteger(n))) setC(path, n);
        }}
      />
    </Field>
  );
}
