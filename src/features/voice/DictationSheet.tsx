import { useMemo, useState } from 'react';
import { CircleAlert, Mic, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Card';
import { Checkbox, Field, TextArea } from '@/components/form';
import { Sheet } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { FINDING } from '@/data/labels';
import type { FindingStatus } from '@/data/schema';
import { formatDate, formatDateTime, localDateOf } from '@/lib/dates';
import { formatDecimal } from '@/lib/numbers';
import { getPath } from '@/lib/objects';
import type { EditorState } from '@/features/consultations/actions';
import { missingImportant } from '@/features/consultations/model';
import { applyDictation } from './apply';
import { parseConsultationDictation, SECTION_LABEL, type ParsedItem, type SectionKey } from './consultation';
import { fold } from './text';

const SECTIONS: SectionKey[] = ['reason', 'anamnesis', 'exam', 'assessment', 'plan'];

const EXAMPLE =
  'Motivo de consulta vómitos desde ayer. Peso 12,4 kilos. Temperatura 39,2. Mucosas rosadas. Abdomen con dolor a la palpación. Resto del examen normal. Diagnóstico presuntivo gastroenteritis. Tratamiento omeprazol 1 mg por kilo oral cada 12 horas por 7 días. Control en 7 días.';

/** Palabras que la app reconoce, por sección (se muestran como ayuda). */
const KEYWORDS: Array<[string, string]> = [
  ['Motivo', '«Motivo de consulta…», «El tutor cuenta que…», «Inicio…»'],
  ['Anamnesis', '«Historia actual…», «Antecedentes…», «Alimentación…», «Eliminación…», «Tratamientos previos…»'],
  [
    'Examen físico',
    '«Peso 12,4 kilos», «Temperatura 38,5», «Frecuencia cardíaca 120», «Frecuencia respiratoria 30», «Llenado capilar 2 segundos», «Condición corporal 5 de 9», «Mucosas rosadas», «Hidratación normal» o «Deshidratación 5 %», «Estado general…», cada sistema («Corazón…», «Pulmones…», «Abdomen…», «Piel…», «Ojos…», «Oídos…», «Linfonodos…», «Boca…», «Locomotor…», «Neurológico…», «Urogenital…») seguido de «normal» o del hallazgo, «Resto del examen normal», «Otros hallazgos…»',
  ],
  ['Evaluación', '«Diagnóstico presuntivo…», «Diagnóstico diferencial A, B y C», «Solicito…», «Pronóstico…»'],
  ['Plan', '«Tratamiento [medicamento] [dosis] [vía] cada [N] horas por [N] días», «Cuidados…», «Recomendaciones…», «Control en 7 días», «Derivo a…», «Observaciones finales…»'],
];

/** Lo que el dato reemplaza o cómo se agrega, para que se vea antes de aceptar. */
function effectNote(item: ParsedItem, state: EditorState): string | undefined {
  const c = state.consultation;
  const ch = item.change;
  switch (ch.kind) {
    case 'text': {
      const cur = ((getPath(c, ch.path) as string | undefined) ?? '').trim();
      if (!cur) return undefined;
      return ch.replace ? `Reemplaza: «${cur.length > 60 ? `${cur.slice(0, 60)}…` : cur}»` : 'Se agrega al texto que ya tiene';
    }
    case 'number': {
      const cur = getPath(c, ch.path) as number | undefined;
      return cur !== undefined && cur !== ch.value ? `Reemplaza el valor anterior (${formatDecimal(cur, 3)})` : undefined;
    }
    case 'finding':
    case 'mucous':
    case 'hydration': {
      const path = ch.kind === 'finding' ? ch.path : `exam.${ch.kind}`;
      const cur = (getPath(c, `${path}.status`) as FindingStatus | undefined) ?? 'not_evaluated';
      return cur !== 'not_evaluated' ? `Reemplaza lo registrado (${FINDING[cur]})` : undefined;
    }
    case 'bcs':
      return c.exam.bcs.value !== undefined ? `Reemplaza ${formatDecimal(c.exam.bcs.value, 1)}/${c.exam.bcs.scale}` : undefined;
    case 'controlDate':
      return c.plan.controlDate && c.plan.controlDate !== ch.date ? `Reemplaza ${formatDate(c.plan.controlDate)}` : undefined;
    case 'diagnosis':
      return state.diagnoses.some((d) => fold(d.name).trim() === fold(ch.name).trim()) ? 'Ya está en la ficha: no se repite' : undefined;
    case 'treatment':
      return state.treatments.some((t) => fold(t.name).trim() === fold(ch.name).trim()) ? 'Ya está en la ficha: no se repite' : undefined;
    case 'restNormal':
      return undefined;
  }
}

const keyOf = (it: ParsedItem) => `${it.label}|${it.display}`;

/**
 * Dictado de la consulta: se habla con el micrófono del teclado del iPhone, la app propone dónde va cada dato y la
 * profesional elige qué agregar. Nada se agrega sin su confirmación.
 */
export function DictationSheet({
  state,
  bcsScale,
  onClose,
  onApply,
}: {
  state: EditorState;
  bcsScale: 5 | 9;
  onClose: () => void;
  onApply: (items: ParsedItem[], text: string) => void;
}) {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<Record<string, boolean>>({});
  const tables = useTables();
  const knownMeds = useMemo(() => [...new Set([...tables.medicationRefs.values(), ...tables.treatments.values()].map((m) => m.name))], [tables.medicationRefs, tables.treatments]);
  const c = state.consultation;
  const parsed = useMemo(
    () => (text.trim() ? parseConsultationDictation(text, { baseDate: localDateOf(c.startedAt), bcsScale, knownMeds }) : { items: [], unplaced: [] }),
    [text, c.startedAt, bcsScale, knownMeds],
  );
  const items = parsed.items.map((it) => ({ ...it, selected: choice[keyOf(it)] ?? it.selected }));
  const selected = items.filter((i) => i.selected);
  const after = useMemo(() => {
    const next = applyDictation(state, selected, '').state;
    return missingImportant(next.consultation, next.diagnoses, next.treatments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, selected.map(keyOf).join('\n')]);
  const previous = c.dictations ?? [];

  return (
    <Sheet
      open
      onClose={onClose}
      title="Dictar la consulta"
      size="full"
      footer={
        <Button block size="lg" icon={<Mic className="size-5" />} disabled={!text.trim()} onClick={() => onApply(selected, text)}>
          {selected.length ? `Agregar ${selected.length} dato${selected.length === 1 ? '' : 's'} a la ficha` : 'Guardar solo el texto dictado'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Notice tone="neutral" icon={<Mic className="size-5" />} title="Cómo dictar">
          <p>
            Toca el cuadro y luego el <strong>micrófono del teclado</strong>. Di el nombre de cada dato antes del valor, con pausas entre uno y otro. Por ejemplo:
          </p>
          <p className="mt-1 italic">«{EXAMPLE}»</p>
          <details className="mt-2">
            <summary className="min-h-9 cursor-pointer py-2 font-semibold text-brand-800">Ver las palabras que entiende</summary>
            <dl className="space-y-1.5">
              {KEYWORDS.map(([title, words]) => (
                <div key={title}>
                  <dt className="font-semibold">{title}</dt>
                  <dd>{words}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2">Si no aparece el micrófono: Ajustes del iPhone › General › Teclado › Activar dictado.</p>
          </details>
        </Notice>

        <Field label="Texto dictado" hint="Puedes corregir el texto aquí antes de agregarlo: la lista de abajo se actualiza sola.">
          <TextArea value={text} onChange={(e) => setText(e.target.value)} minRows={6} placeholder="Toca aquí y usa el micrófono del teclado…" autoCapitalize="sentences" />
        </Field>
        <p className="flex items-start gap-1.5 text-[13px] text-ink-500">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          El dictado lo transcribe el teclado del iPhone (Apple). {` `}La app no envía este texto a ningún lugar: lo interpreta en este teléfono y lo guarda cifrado con la consulta.
        </p>

        {text.trim() !== '' && (
          <section aria-label="Datos encontrados" className="space-y-3">
            <h3 className="text-[15px] font-semibold text-ink-900">
              {items.length ? `Datos encontrados (${selected.length} de ${items.length} marcados)` : 'Aún no se reconocen datos'}
            </h3>
            {SECTIONS.map((sec) => {
              const list = items.filter((i) => i.section === sec);
              if (!list.length) return null;
              return (
                <div key={sec} className="card divide-y divide-sand-100 px-3">
                  <p className="py-2 text-[13px] font-semibold uppercase tracking-wide text-ink-500">{SECTION_LABEL[sec]}</p>
                  {list.map((it) => {
                    const note = effectNote(it, state);
                    return (
                      <Checkbox
                        key={it.id}
                        checked={it.selected}
                        onChange={(v) => setChoice((m) => ({ ...m, [keyOf(it)]: v }))}
                        label={
                          <>
                            <span className="font-semibold">{it.label}:</span> {it.display}
                          </>
                        }
                        description={
                          <>
                            <span className="block italic">«{it.source}»</span>
                            {note && <span className="block">{note}</span>}
                            {it.warning && <span className="block font-semibold text-amber-800">{it.warning}</span>}
                          </>
                        }
                      />
                    );
                  })}
                </div>
              );
            })}
            {parsed.unplaced.length > 0 && (
              <Notice tone="warning" title="No se pudo ubicar" icon={<CircleAlert className="size-5" />}>
                <ul className="list-disc pl-5">
                  {parsed.unplaced.map((u, i) => (
                    <li key={i}>«{u}»</li>
                  ))}
                </ul>
                <p className="mt-1">Queda guardado en el texto dictado de la consulta. Puedes agregarlo a mano o dictarlo de nuevo nombrando el dato.</p>
              </Notice>
            )}
          </section>
        )}

        {after.length > 0 && (
          <Notice tone="info" title={`Datos importantes que ${text.trim() ? 'aún faltarían' : 'faltan'}`}>
            <p>{after.map((m) => m.label).join(' · ')}</p>
            <p className="mt-1">Puedes dictarlos ahora: se agregan a lo que ya tiene la ficha.</p>
          </Notice>
        )}

        {previous.length > 0 && (
          <details className="card px-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-semibold text-ink-800">Dictados anteriores de esta consulta ({previous.length})</summary>
            <ul className="space-y-2 pb-3">
              {previous.map((d) => (
                <li key={d.id} className="text-sm">
                  <span className="font-semibold text-ink-600">{formatDateTime(d.at)}</span>
                  <p className="whitespace-pre-wrap text-ink-800">{d.text}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Sheet>
  );
}
