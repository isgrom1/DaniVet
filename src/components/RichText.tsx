import { Fragment, useEffect, useId, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Bold, Heading2, List, Table2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { insertBlock, parseRichText, tableAt, tableText, toggleBold, toggleLinePrefix, type Edit, type RichBlock, type Span } from '@/lib/richText';
import { Button } from './Button';
import { Notice } from './Card';
import { TextArea, TextInput } from './form';
import { Sheet } from './overlay';

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.bold ? (
          <strong key={i} className="font-semibold">
            {s.text}
          </strong>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Muestra un texto con formato simple (subtítulos, viñetas, negritas y tablas) como se verá en el PDF. */
export function RichTextView({ text, className }: { text: string; className?: string }) {
  const blocks = parseRichText(text);
  // Las viñetas seguidas forman una sola lista.
  const groups: Array<RichBlock | { kind: 'bullets'; items: Span[][] }> = [];
  for (const b of blocks) {
    const last = groups[groups.length - 1];
    if (b.kind === 'bullet' && last?.kind === 'bullets') last.items.push(b.spans);
    else if (b.kind === 'bullet') groups.push({ kind: 'bullets', items: [b.spans] });
    else groups.push(b);
  }
  return (
    <div className={cn('space-y-1.5 whitespace-normal', className)}>
      {groups.map((g, i) => {
        if (g.kind === 'space') return <div key={i} className="h-1" />;
        if (g.kind === 'heading')
          return (
            <p key={i} className="border-b border-brand-300 pb-0.5 pt-1 font-semibold text-brand-800">
              <Spans spans={g.spans} />
            </p>
          );
        if (g.kind === 'paragraph')
          return (
            <p key={i}>
              <Spans spans={g.spans} />
            </p>
          );
        if (g.kind === 'bullets')
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {g.items.map((s, k) => (
                <li key={k}>
                  <Spans spans={s} />
                </li>
              ))}
            </ul>
          );
        if (g.kind === 'table')
          return (
            <div key={i} className="overflow-x-auto py-1">
              <table className="w-full border-collapse text-center text-sm">
                <thead>
                  <tr className="bg-brand-700 text-white">
                    {g.header.map((c, k) => (
                      <th key={k} scope="col" className="border border-brand-700 px-3 py-1.5 font-semibold">
                        <Spans spans={c} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, k) => (
                    <tr key={k} className={k % 2 ? 'bg-brand-50' : 'bg-white'}>
                      {r.map((c, j) => (
                        <td key={j} className="border border-sand-300 px-3 py-1.5">
                          <Spans spans={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        return null;
      })}
    </div>
  );
}

const EMPTY_TABLE = () => [
  ['', '', ''],
  ['', '', ''],
  ['', '', ''],
];
const MAX_COLS = 4;

/** Hoja para escribir una tabla celda por celda (la primera fila es el encabezado). */
function TableSheet({ initial, editing, onSave, onClose }: { initial: string[][]; editing: boolean; onSave: (cells: string[][]) => void; onClose: () => void }) {
  // Ids propios: la hoja se abre dentro del campo del texto y no debe heredar su id.
  const baseId = useId();
  const [cells, setCells] = useState(initial);
  const [error, setError] = useState('');
  const cols = cells[0].length;
  const set = (r: number, c: number, v: string) => {
    setError('');
    setCells((prev) => prev.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  };
  const save = () => {
    const body = cells.slice(1).filter((r) => r.some((c) => c.trim()));
    if (!cells[0].some((c) => c.trim())) return setError('Escribe el título de al menos una columna.');
    if (!body.length) return setError('Completa al menos una fila.');
    onSave([cells[0], ...body]);
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Editar tabla' : 'Agregar tabla'}
      size="full"
      footer={
        <Button block onClick={save}>
          {editing ? 'Guardar tabla' : 'Agregar tabla'}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-600">La primera fila son los títulos de las columnas. Las filas vacías no se agregan.</p>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {cells.map((row, i) =>
            row.map((value, j) => (
              <TextInput
                key={`${i}-${j}`}
                id={`${baseId}-${i}-${j}`}
                value={value}
                onChange={(e) => set(i, j, e.target.value)}
                aria-label={i === 0 ? `Título de la columna ${j + 1}` : `Fila ${i}, columna ${j + 1}`}
                placeholder={i === 0 ? `Columna ${j + 1}` : undefined}
                className={cn('px-2', i === 0 && 'bg-brand-50 font-semibold')}
              />
            )),
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setCells((p) => [...p, Array<string>(cols).fill('')])}>
            Agregar fila
          </Button>
          <Button variant="secondary" size="sm" className="min-h-11" disabled={cells.length <= 2} onClick={() => setCells((p) => p.slice(0, -1))}>
            Quitar última fila
          </Button>
          <Button variant="secondary" size="sm" className="min-h-11" disabled={cols >= MAX_COLS} onClick={() => setCells((p) => p.map((r) => [...r, '']))}>
            Agregar columna
          </Button>
          <Button variant="secondary" size="sm" className="min-h-11" disabled={cols <= 2} onClick={() => setCells((p) => p.map((r) => r.slice(0, -1)))}>
            Quitar última columna
          </Button>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Sheet>
  );
}

function ToolButton({ label, icon, onClick, disabled }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      // En computador, evita que el cuadro de texto pierda la selección al presionar el botón.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border border-sand-300 bg-white px-1 text-[12px] font-semibold leading-tight text-ink-700 active:bg-sand-100 disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Cuadro de texto con barra de formato (subtítulo, negrita, viñeta y tabla). El formato se guarda como texto y se
 * dibuja en el PDF de indicaciones; la vista previa muestra cómo quedará.
 */
export function RichTextArea({
  value,
  onChange,
  disabled,
  minRows = 3,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void; minRows?: number; invalid?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Hasta que se toca el cuadro, lo nuevo se agrega al final del texto.
  const touched = useRef(false);
  const [table, setTable] = useState<{ start: number; end: number; cells: string[][]; editing: boolean } | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const mark = () => (touched.current = true);
    el?.addEventListener('focus', mark);
    return () => el?.removeEventListener('focus', mark);
  }, []);
  const selection = (): [number, number] => {
    const el = ref.current;
    if (!el || !touched.current) return [value.length, value.length];
    return [el.selectionStart ?? value.length, el.selectionEnd ?? value.length];
  };
  const apply = (edit: Edit) => {
    onChange(edit.text);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(edit.start, edit.end);
    });
  };
  const openTable = () => {
    const [start, end] = selection();
    const found = tableAt(value, start);
    setTable(found ? { ...found, editing: true } : { start: end, end, cells: EMPTY_TABLE(), editing: false });
  };
  const hasFormat = /(^|\n)\s*(#{1,3}|[•·*-])\s|\*\*.+?\*\*|\|/.test(value);
  return (
    <div className="space-y-1.5">
      {!disabled && (
        <div className="grid grid-cols-4 gap-1.5" role="toolbar" aria-label="Formato del texto">
          <ToolButton label="Subtítulo" icon={<Heading2 className="size-4" aria-hidden />} onClick={() => apply(toggleLinePrefix(value, ...selection(), 'heading'))} />
          <ToolButton label="Negrita" icon={<Bold className="size-4" aria-hidden />} onClick={() => apply(toggleBold(value, ...selection()))} />
          <ToolButton label="Viñeta" icon={<List className="size-4" aria-hidden />} onClick={() => apply(toggleLinePrefix(value, ...selection(), 'bullet'))} />
          <ToolButton label="Tabla" icon={<Table2 className="size-4" aria-hidden />} onClick={openTable} />
        </div>
      )}
      <TextArea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} minRows={minRows} disabled={disabled} {...rest} />
      {hasFormat && value.trim() && (
        <details open={preview} onToggle={(e) => setPreview((e.currentTarget as HTMLDetailsElement).open)} className="rounded-xl bg-white px-3 ring-1 ring-sand-200">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-800">Vista previa con formato</summary>
          {preview && <RichTextView text={value} className="pb-3 text-[15px] text-ink-900" />}
        </details>
      )}
      {table && (
        <TableSheet
          initial={table.cells}
          editing={table.editing}
          onClose={() => setTable(null)}
          onSave={(cells) => {
            const block = tableText(cells);
            apply(table.editing ? { text: value.slice(0, table.start) + block + value.slice(table.end), start: table.start + block.length, end: table.start + block.length } : insertBlock(value, table.start, table.end, block));
            setTable(null);
          }}
        />
      )}
    </div>
  );
}
