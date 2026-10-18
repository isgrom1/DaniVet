import type { Exam, LabValue } from '@/data/schema';
import { ANALYTES, analyteDef, convertUnit, flagOf, PANELS, panelOf, type PanelKey } from './analytes';

/** Fecha de un examen en la evolución: la toma de muestra o, si no se registró, la solicitud (no la recepción). */
export function examDate(e: Exam): string {
  return e.sampleDate ?? e.requestedAt;
}

export type Flag = 'low' | 'high' | 'normal' | undefined;

export interface TrendCell {
  exam: Exam;
  date: string;
  v: LabValue;
  /** Valor expresado en la unidad de la fila (unidades equivalentes convertidas). */
  value?: number;
  flag: Flag;
}

export interface TrendRow {
  /** Analito y grupo de unidad: un mismo analito informado en % y en ×10³/µL son dos filas. */
  key: string;
  code: string;
  name: string;
  panel: PanelKey | 'other';
  unit: string;
  digits: number;
  qualitative: boolean;
  /** Celdas por examen (id). */
  cells: Map<string, TrendCell>;
  anyOut: boolean;
}

export interface TrendTable {
  /** Exámenes con valores, del más reciente al más antiguo. */
  exams: Exam[];
  rows: TrendRow[];
}

const COUNT = new Set(['/µL', '×10³/µL', '×10⁶/µL', '×10⁹/L', '×10¹²/L']);
const unitGroup = (unit: string) => (COUNT.has(unit) ? 'count' : unit);
const ORDER = new Map(ANALYTES.map((a, i) => [a.code, i]));

const hasData = (v: LabValue) => v.value !== undefined || !!v.text?.trim();

export function examsWithValues(exams: Exam[]): Exam[] {
  return exams
    .filter((e) => e.status !== 'cancelled' && (e.values ?? []).some(hasData))
    .sort((a, b) => examDate(b).localeCompare(examDate(a)) || b.createdAt.localeCompare(a.createdAt));
}

/** Tabla de evolución: una fila por valor, una columna por examen. */
export function buildTrends(allExams: Exam[]): TrendTable {
  const exams = examsWithValues(allExams);
  const rows = new Map<string, TrendRow>();
  // Primero se decide la unidad de cada fila (la del catálogo si alguien la usó; si no, la más reciente).
  const unitsSeen = new Map<string, string[]>();
  for (const e of exams)
    for (const v of e.values ?? []) {
      if (!hasData(v)) continue;
      const unit = v.unit ?? '';
      const key = `${v.analyte}|${unitGroup(unit)}`;
      unitsSeen.set(key, [...(unitsSeen.get(key) ?? []), unit]);
    }
  for (const e of exams) {
    for (const v of e.values ?? []) {
      if (!hasData(v)) continue;
      const unit = v.unit ?? '';
      const key = `${v.analyte}|${unitGroup(unit)}`;
      let row = rows.get(key);
      if (!row) {
        const def = analyteDef(v.analyte);
        const seen = unitsSeen.get(key) ?? [unit];
        row = {
          key,
          code: v.analyte,
          name: def?.name ?? v.name,
          panel: panelOf(v.analyte),
          unit: def && seen.includes(def.unit) ? def.unit : seen[0],
          digits: def?.digits ?? 2,
          qualitative: !!def?.qualitative || v.value === undefined,
          cells: new Map(),
          anyOut: false,
        };
        rows.set(key, row);
      }
      if (row.cells.has(e.id)) continue;
      const value = v.value === undefined ? undefined : (convertUnit(v.value, unit, row.unit) ?? undefined);
      if (v.value !== undefined) row.qualitative = false;
      const flag = flagOf(v.value, v.refLow, v.refHigh);
      if (flag === 'low' || flag === 'high') row.anyOut = true;
      row.cells.set(e.id, { exam: e, date: examDate(e), v, value, flag });
    }
  }
  const panelIdx = (p: PanelKey | 'other') => (p === 'other' ? PANELS.length : PANELS.indexOf(p));
  const sorted = [...rows.values()].sort(
    (a, b) => panelIdx(a.panel) - panelIdx(b.panel) || (ORDER.get(a.code) ?? 999) - (ORDER.get(b.code) ?? 999) || a.name.localeCompare(b.name, 'es') || a.unit.localeCompare(b.unit),
  );
  return { exams, rows: sorted };
}

/** Puntos de una fila en orden cronológico (del más antiguo al más reciente). */
export function rowSeries(row: TrendRow, exams: Exam[]): TrendCell[] {
  return exams
    .map((e) => row.cells.get(e.id))
    .filter((c): c is TrendCell => !!c)
    .reverse();
}

/** Diferencia con el valor anterior de la misma fila (misma unidad). */
export function deltaOf(current?: number, previous?: number): { abs: number; pct?: number } | null {
  if (current === undefined || previous === undefined) return null;
  const abs = current - previous;
  return { abs, pct: previous !== 0 ? (abs / Math.abs(previous)) * 100 : undefined };
}

/**
 * Último valor anterior del mismo analito para el paciente (en otro examen, con fecha igual o anterior),
 * expresado en la unidad pedida. Sirve para mostrar la variación al ingresar un examen.
 */
export function previousValue(
  exams: Exam[],
  opts: { excludeExamId?: string; analyte: string; unit: string; beforeOrOn: string },
): { value: number; date: string; exam: Exam } | null {
  const list = examsWithValues(exams).filter((e) => e.id !== opts.excludeExamId && examDate(e) <= opts.beforeOrOn);
  for (const e of list) {
    const v = (e.values ?? []).find((x) => x.analyte === opts.analyte && x.value !== undefined);
    if (!v || v.value === undefined) continue;
    const value = convertUnit(v.value, v.unit ?? '', opts.unit);
    if (value === null) continue;
    return { value, date: examDate(e), exam: e };
  }
  return null;
}

/** Rango de referencia de una celda, en la unidad de la fila. */
export function cellRange(row: TrendRow, c: TrendCell): { low?: number; high?: number } {
  const unit = c.v.unit ?? '';
  const conv = (n?: number) => (n === undefined ? undefined : (convertUnit(n, unit, row.unit) ?? undefined));
  return { low: conv(c.v.refLow), high: conv(c.v.refHigh) };
}
