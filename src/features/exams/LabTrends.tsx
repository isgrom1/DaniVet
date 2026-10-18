import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Notice } from '@/components/Card';
import { SearchInput, Select } from '@/components/form';
import { Sheet } from '@/components/overlay';
import { EXAM_TYPE } from '@/data/labels';
import type { Exam } from '@/data/schema';
import { formatDate } from '@/lib/dates';
import { formatDecimal } from '@/lib/numbers';
import { cn } from '@/lib/cn';
import { fold } from '@/features/voice/text';
import { analyteDef, PANEL_LABEL, PANELS, type PanelKey } from './analytes';
import { LabChart } from './LabChart';
import { buildTrends, cellRange, deltaOf, examDate, rowSeries, type Flag, type TrendCell, type TrendRow } from './trends';

const examTitle = (e: Exam) => e.name || EXAM_TYPE[e.type];
const shortDate = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(2, 4)}`;

function FlagMark({ flag }: { flag: Flag }) {
  if (flag === 'high') return <ArrowUp className="inline size-3.5 text-amber-800" aria-label="alto" />;
  if (flag === 'low') return <ArrowDown className="inline size-3.5 text-sky-800" aria-label="bajo" />;
  return null;
}

function cellText(row: TrendRow, c: TrendCell): string {
  if (c.v.value === undefined) return c.v.text ?? '';
  return formatDecimal(c.value ?? c.v.value, row.digits);
}

function signed(n: number, digits: number) {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatDecimal(Math.abs(n), digits)}`;
}

/**
 * Evolución de los valores de laboratorio de un paciente: tabla (valores × exámenes) con filtros por examen,
 * panel, nombre del valor y valores fuera de rango. Tocar un valor abre su gráfico y el detalle.
 */
export function LabTrends({ exams }: { exams: Exam[] }) {
  const table = useMemo(() => buildTrends(exams), [exams]);
  const [examId, setExamId] = useState('');
  const [panel, setPanel] = useState<PanelKey | 'other' | 'all'>('all');
  const [q, setQ] = useState('');
  const [onlyOut, setOnlyOut] = useState(false);
  const [open, setOpen] = useState<TrendRow | null>(null);

  if (!table.exams.length) {
    return <Notice tone="neutral">Aún no hay valores registrados. Al registrar un examen, ingresa sus valores en «Valores del examen» para ver aquí cómo cambian.</Notice>;
  }
  const selected = table.exams.find((e) => e.id === examId);
  // Examen específico: se compara con el examen anterior que tenga alguno de sus valores.
  const columns = selected
    ? [
        selected,
        ...table.exams.filter((e) => examDate(e) <= examDate(selected) && e.id !== selected.id && table.rows.some((r) => r.cells.has(selected.id) && r.cells.has(e.id))).slice(0, 1),
      ]
    : table.exams;
  const panels = [...new Set(table.rows.map((r) => r.panel))].sort((a, b) => (a === 'other' ? 99 : PANELS.indexOf(a)) - (b === 'other' ? 99 : PANELS.indexOf(b)));
  const fq = fold(q).trim();
  const rows = table.rows.filter((r) => {
    if (selected && !r.cells.has(selected.id)) return false;
    if (panel !== 'all' && r.panel !== panel) return false;
    if (onlyOut && !(selected ? ['low', 'high'].includes(r.cells.get(selected.id)?.flag ?? '') : r.anyOut)) return false;
    if (fq && !fold(r.name).includes(fq) && !(analyteDef(r.code)?.aliases.some((a) => a.includes(fq)) ?? false)) return false;
    return true;
  });
  const compare = selected && columns.length === 2;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Select value={examId} onChange={(e) => setExamId(e.target.value)} aria-label="Examen">
          <option value="">Todos los exámenes ({table.exams.length})</option>
          {table.exams.map((e) => (
            <option key={e.id} value={e.id}>
              {formatDate(examDate(e))} · {examTitle(e)}
              {e.lab ? ` · ${e.lab}` : ''}
            </option>
          ))}
        </Select>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar un valor (ej.: creatinina)" />
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex w-max gap-1.5" role="group" aria-label="Filtrar por panel">
            {(['all', ...panels] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={panel === p}
                onClick={() => setPanel(p)}
                className={cn('min-h-11 rounded-full px-3 text-sm font-medium ring-1', panel === p ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-ink-700 ring-sand-300')}
              >
                {p === 'all' ? 'Todos' : PANEL_LABEL[p]}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={onlyOut}
              onClick={() => setOnlyOut((v) => !v)}
              className={cn('min-h-11 rounded-full px-3 text-sm font-medium ring-1', onlyOut ? 'bg-amber-700 text-white ring-amber-700' : 'bg-white text-ink-700 ring-sand-300')}
            >
              Solo fuera de rango
            </button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <Notice tone="neutral">Ningún valor coincide con los filtros.</Notice>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <caption className="sr-only">Valores de laboratorio por examen</caption>
            <thead>
              <tr className="border-b border-sand-200 text-left align-bottom">
                <th scope="col" className="sticky left-0 z-10 bg-white px-3 py-2 text-[12px] font-semibold text-ink-500">
                  Valor
                </th>
                {columns.map((e, i) => (
                  <th key={e.id} scope="col" className="min-w-20 px-2 py-2 text-right text-[12px] font-semibold text-ink-600">
                    <Link to={`/examenes/${e.id}`} className="block underline-offset-2 hover:underline">
                      {compare ? (i === 0 ? 'Este examen' : 'Anterior') : shortDate(examDate(e))}
                      <span className="block font-normal text-ink-500">{compare ? shortDate(examDate(e)) : (e.lab ?? examTitle(e))}</span>
                    </Link>
                  </th>
                ))}
                {compare && (
                  <th scope="col" className="min-w-16 px-2 py-2 text-right text-[12px] font-semibold text-ink-600">
                    Cambio
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = compare ? deltaOf(r.cells.get(columns[0].id)?.value, r.cells.get(columns[1].id)?.value) : null;
                return (
                  <tr key={r.key} className="border-b border-sand-100 last:border-0">
                    <th scope="row" className="sticky left-0 z-10 bg-white px-0 py-0 text-left font-normal">
                      <button type="button" onClick={() => setOpen(r)} className="block min-h-12 w-36 px-3 py-1.5 text-left active:bg-sand-100" aria-label={`Ver evolución de ${r.name}`}>
                        <span className="block text-[14px] font-semibold leading-tight text-ink-900">{r.name}</span>
                        {r.unit && <span className="block text-[12px] text-ink-500">{r.unit}</span>}
                      </button>
                    </th>
                    {columns.map((e) => {
                      const c = r.cells.get(e.id);
                      return (
                        <td
                          key={e.id}
                          className={cn('px-2 py-1.5 text-right tabular-nums', c?.flag === 'high' && 'bg-amber-50 font-semibold text-amber-900', c?.flag === 'low' && 'bg-sky-50 font-semibold text-sky-900')}
                        >
                          {c ? (
                            <>
                              {cellText(r, c)} <FlagMark flag={c.flag} />
                            </>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    {compare && (
                      <td className="px-2 py-1.5 text-right tabular-nums text-ink-700">
                        {d ? (
                          <>
                            {signed(d.abs, r.digits)}
                            {d.pct !== undefined && Math.abs(d.pct) >= 0.5 && <span className="block text-[12px] text-ink-500">{signed(Math.round(d.pct), 0)} %</span>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-1 text-[12px] text-ink-500">
        <ArrowUp className="inline size-3 text-amber-800" aria-hidden /> sobre el rango del informe · <ArrowDown className="inline size-3 text-sky-800" aria-hidden /> bajo el rango · sin marca: dentro del rango o sin rango informado.
        {selected && !compare && ' No hay un examen anterior con estos valores para comparar.'}
      </p>
      {open && <AnalyteSheet row={open} exams={table.exams} onClose={() => setOpen(null)} />}
    </div>
  );
}

function AnalyteSheet({ row, exams, onClose }: { row: TrendRow; exams: Exam[]; onClose: () => void }) {
  const series = rowSeries(row, exams);
  const numeric = series.filter((c) => c.value !== undefined);
  const latest = series[series.length - 1];
  return (
    <Sheet open onClose={onClose} title={`${row.name}${row.unit ? ` (${row.unit})` : ''}`} size="full">
      <div className="space-y-4">
        {numeric.length >= 2 ? (
          <LabChart
            label={row.name}
            unit={row.unit}
            digits={row.digits}
            points={numeric.map((c) => ({ date: c.date, value: c.value!, ...cellRange(row, c), flag: c.flag, lab: c.exam.lab }))}
          />
        ) : (
          latest && (
            <div className="card p-4">
              <p className="text-sm text-ink-500">Único valor registrado · {formatDate(latest.date)}</p>
              <p className="text-3xl font-semibold text-ink-900">
                {cellText(row, latest)} <span className="text-base font-medium text-ink-500">{row.unit}</span>
              </p>
              <p className="mt-1 text-sm text-ink-500">Cuando registres otro examen con este valor, aquí verás su evolución.</p>
            </div>
          )
        )}
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <caption className="px-3 pt-3 text-left text-[13px] font-semibold uppercase tracking-wide text-ink-500">Todos los valores</caption>
            <thead>
              <tr className="border-b border-sand-200 text-left text-[12px] text-ink-500">
                <th scope="col" className="px-3 py-2 font-semibold">Fecha</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Valor</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Cambio</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((c, i, arr) => {
                const prev = arr[i + 1];
                const d = deltaOf(c.value, prev?.value);
                const range = cellRange(row, c);
                return (
                  <tr key={c.exam.id} className="border-b border-sand-100 align-top last:border-0">
                    <td className="px-3 py-2">
                      <Link to={`/examenes/${c.exam.id}`} className="font-semibold text-brand-800 underline-offset-2 hover:underline">
                        {formatDate(c.date)}
                      </Link>
                      {c.exam.lab && <span className="block text-[12px] text-ink-500">{c.exam.lab}</span>}
                    </td>
                    <td className={cn('px-2 py-2 text-right tabular-nums', c.flag === 'high' && 'font-semibold text-amber-900', c.flag === 'low' && 'font-semibold text-sky-900')}>
                      {cellText(row, c)} <FlagMark flag={c.flag} />
                      {(c.flag === 'high' || c.flag === 'low') && <span className="block text-[12px]">{c.flag === 'high' ? 'Alto' : 'Bajo'}</span>}
                      {c.v.unit !== undefined && c.v.unit !== row.unit && c.v.value !== undefined && (
                        <span className="block text-[12px] font-normal text-ink-500">
                          informado {formatDecimal(c.v.value, 6)} {c.v.unit}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-700">
                      {d ? (
                        <>
                          {signed(d.abs, row.digits)}
                          {d.pct !== undefined && <span className="block text-[12px] text-ink-500">{signed(Math.round(d.pct), 0)} %</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-600">
                      {range.low !== undefined || range.high !== undefined
                        ? `${range.low !== undefined ? formatDecimal(range.low, 6) : '…'}–${range.high !== undefined ? formatDecimal(range.high, 6) : '…'}`
                        : 'Sin rango'}
                      {c.v.note && <span className="block text-left text-[12px] text-ink-500">{c.v.note}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-ink-500">Los rangos son los que informó cada laboratorio; entre laboratorios distintos pueden variar.</p>
      </div>
    </Sheet>
  );
}
