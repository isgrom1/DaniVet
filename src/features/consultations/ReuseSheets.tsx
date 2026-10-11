import { useMemo, useState } from 'react';
import { Copy, Sparkles } from 'lucide-react';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/form';
import { Notice } from '@/components/Card';
import { Sheet } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import type { Consultation } from '@/data/schema';
import { formatDate } from '@/lib/dates';
import { getPath } from '@/lib/objects';
import { truncate } from '@/lib/text';
import { cn } from '@/lib/cn';
import { COPYABLE_FIELDS, TEMPLATABLE_FIELDS } from './model';

/** Copia campos de antecedentes de una consulta anterior. El examen físico, el diagnóstico y el tratamiento NO se pueden copiar. */
export function CopyFromPreviousSheet({ current, onClose, onCopy }: { current: Consultation; onClose: () => void; onCopy: (fromId: string, values: Record<string, string>) => void }) {
  const tables = useTables();
  const previous = useMemo(
    () =>
      [...tables.consultations.values()]
        .filter((c) => c.patientId === current.patientId && c.id !== current.id && c.status !== 'voided')
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [tables, current],
  );
  const [fromId, setFromId] = useState(previous[0]?.id ?? '');
  const from = tables.consultations.get(fromId);
  const available = COPYABLE_FIELDS.filter((f) => String(getPath(from, f.path) ?? '').trim());
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Copiar de una consulta anterior"
      size="full"
      footer={
        <Button
          block
          disabled={!from || selected.length === 0}
          icon={<Copy className="size-4" />}
          onClick={() => from && onCopy(from.id, Object.fromEntries(selected.map((p) => [p, String(getPath(from, p) ?? '')])))}
        >
          Copiar {selected.length || ''} campo(s) para revisar
        </Button>
      }
    >
      <div className="space-y-4">
        <Notice tone="warning">
          Solo se pueden reutilizar antecedentes. El <strong>examen físico, los diagnósticos y los tratamientos nunca se copian</strong>: deben registrarse para esta
          atención. Cada campo copiado quedará marcado “Copiado: revisar” y deberás confirmarlo antes de finalizar.
        </Notice>
        {previous.length === 0 ? (
          <p className="text-sm text-ink-500">No hay consultas anteriores de este paciente.</p>
        ) : (
          <>
            <div className="-mx-4 overflow-x-auto px-4">
              <div className="flex w-max gap-1.5">
                {previous.slice(0, 10).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setFromId(c.id);
                      setSelected([]);
                    }}
                    className={cn('min-h-10 rounded-full px-3 text-sm font-semibold', c.id === fromId ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-sand-300')}
                  >
                    {formatDate(c.startedAt)}
                  </button>
                ))}
              </div>
            </div>
            {available.length === 0 ? (
              <p className="text-sm text-ink-500">Esa consulta no tiene antecedentes que se puedan copiar.</p>
            ) : (
              <div className="space-y-2">
                {available.map((f) => (
                  <div key={f.path} className="card p-3">
                    <Checkbox checked={selected.includes(f.path)} onChange={(v) => setSelected((s) => (v ? [...s, f.path] : s.filter((x) => x !== f.path)))} label={f.label} />
                    <p className="mt-1 whitespace-pre-wrap rounded-lg bg-sand-100 p-2 text-sm text-ink-700">{truncate(String(getPath(from, f.path)), 400)}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

export function TemplateSheet({ current, onClose, onApply }: { current: Consultation; onClose: () => void; onApply: (templateId: string, values: Record<string, string>) => void }) {
  const tables = useTables();
  const templates = [...tables.templates.values()].filter((t) => t.kind === 'consultation' && t.active).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return (
    <Sheet open onClose={onClose} title="Usar una plantilla">
      <div className="space-y-3">
        <Notice tone="info" icon={<Sparkles className="size-5" />}>
          Las plantillas completan solo campos de texto vacíos (motivo, historia actual, cuidados y recomendaciones). Quedarán marcados para revisión. Crea tus plantillas en
          Ajustes › Plantillas.
        </Notice>
        {templates.length === 0 && <p className="text-sm text-ink-500">Aún no tienes plantillas de consulta.</p>}
        {templates.map((t) => {
          const fields = TEMPLATABLE_FIELDS.filter((f) => t.fields[f.path]?.trim());
          const applicable = fields.filter((f) => !String(getPath(current, f.path) ?? '').trim());
          return (
            <div key={t.id} className="card space-y-2 p-3">
              <p className="font-semibold">{t.name}</p>
              <p className="text-sm text-ink-500">{fields.map((f) => f.label).join(' · ') || 'Sin campos'}</p>
              <Button
                size="sm"
                variant="secondary"
                disabled={applicable.length === 0}
                onClick={() => onApply(t.id, Object.fromEntries(applicable.map((f) => [f.path, t.fields[f.path]])))}
              >
                {applicable.length ? `Aplicar a ${applicable.length} campo(s) vacío(s)` : 'Los campos ya tienen contenido'}
              </Button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
