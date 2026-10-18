import { describe, expect, it } from 'vitest';
import type { Exam, LabValue } from '@/data/schema';
import { parseLabDictation } from '@/features/voice/labs';
import { ANALYTES, convertUnit, customCode, flagOf, searchAnalytes } from './analytes';
import { rangesToRemember, rangeKey, rowsFromValues, valuesFromRows } from './LabValuesEditor';
import { buildTrends, cellRange, deltaOf, previousValue, rowSeries } from './trends';

let n = 0;
function exam(date: string, values: Array<Partial<LabValue> & { analyte: string }>, extra: Partial<Exam> = {}): Exam {
  n++;
  return {
    id: `e${n}`,
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    rev: 1,
    patientId: 'p1',
    type: 'biochemistry',
    requestedAt: date,
    status: 'reviewed',
    values: values.map((v, i) => ({ id: `${n}-${i}`, name: ANALYTES.find((a) => a.code === v.analyte)?.name ?? v.analyte, unit: ANALYTES.find((a) => a.code === v.analyte)?.unit, ...v })),
    ...extra,
  } as Exam;
}

describe('catálogo de valores', () => {
  it('no trae rangos de referencia propios y sus códigos son únicos', () => {
    expect(new Set(ANALYTES.map((a) => a.code)).size).toBe(ANALYTES.length);
    for (const a of ANALYTES) expect(Object.keys(a)).not.toContain('refLow');
  });

  it('marca alto o bajo solo con el rango informado', () => {
    expect(flagOf(2, undefined, undefined)).toBeUndefined();
    expect(flagOf(2, 0.5, 1.5)).toBe('high');
    expect(flagOf(0.4, 0.5, 1.5)).toBe('low');
    expect(flagOf(1, 0.5, 1.5)).toBe('normal');
    expect(flagOf(1, 0.5, undefined)).toBe('normal');
  });

  it('convierte solo entre unidades de recuento equivalentes', () => {
    expect(convertUnit(12500, '/µL', '×10³/µL')).toBe(12.5);
    expect(convertUnit(6.5, '×10⁶/µL', '/µL')).toBe(6.5e6);
    expect(convertUnit(1.8, 'mg/dL', 'µmol/L')).toBeNull();
    expect(convertUnit(1.8, 'mg/dL', 'mg/dL')).toBe(1.8);
  });

  it('busca por nombre o sigla sin tildes', () => {
    expect(searchAnalytes('creat').map((a) => a.code)).toContain('crea');
    expect(searchAnalytes('gpt').map((a) => a.code)).toEqual(['alt']);
    expect(searchAnalytes('albumina').map((a) => a.code)).toEqual(['alb']);
    expect(customCode('  Ácido Úrico ')).toBe('custom:acido urico');
  });
});

describe('dictado de valores', () => {
  it('lee nombres, siglas, números chilenos, miles y rangos', () => {
    const { values, unplaced } = parseLabDictation(
      'Hematocrito 45,2, hemoglobina 15, plaquetas 250 mil, leucocitos 12.500, neutrófilos 75%, GPT 85 U/L, creatinina 1,8 mg/dL referencia 0,5 a 1,5 levemente alta, densidad 1.025, proteínas en orina dos cruces',
    );
    expect(unplaced).toEqual([]);
    const by = Object.fromEntries(values.map((v) => [v.code, v]));
    expect(by.hct).toMatchObject({ value: 45.2, unit: '%' });
    expect(by.hgb).toMatchObject({ value: 15, unit: 'g/dL' });
    expect(by.plt).toMatchObject({ value: 250, unit: '×10³/µL' });
    expect(by.wbc).toMatchObject({ value: 12.5, unit: '×10³/µL' });
    expect(by.neut).toMatchObject({ value: 75, unit: '%' });
    expect(by.alt).toMatchObject({ value: 85, unit: 'U/L' });
    expect(by.crea).toMatchObject({ value: 1.8, refLow: 0.5, refHigh: 1.5, note: 'Levemente alta' });
    expect(by.usg).toMatchObject({ value: 1.025 });
    expect(by.uprot).toMatchObject({ text: '++' });
    // Ningún rango aparece si no se dictó.
    expect(by.hct.refLow).toBeUndefined();
  });

  it('acepta números en palabras y deja sin ubicar lo que no reconoce', () => {
    const { values, unplaced } = parseLabDictation('Informe del laboratorio. Glucosa ciento diez, potasio 4,5');
    expect(values.map((v) => [v.code, v.value])).toEqual([
      ['glu', 110],
      ['k', 4.5],
    ]);
    expect(unplaced).toEqual(['Informe del laboratorio']);
  });
});

describe('filas del formulario', () => {
  it('descarta filas vacías, valida números y conserva lo escrito', () => {
    const rows = rowsFromValues([{ id: 'a', analyte: 'crea', name: 'Creatinina', value: 1.8, unit: 'mg/dL', refLow: 0.5, refHigh: 1.5 }]);
    expect(rows[0]).toMatchObject({ value: '1,8', refLow: '0,5', refHigh: '1,5' });
    const empty = { id: 'b', analyte: 'alt', name: 'ALT (GPT)', value: '', text: '', unit: 'U/L', refLow: '10', refHigh: '100', note: '' };
    expect(valuesFromRows([...rows, empty]).values).toEqual([{ id: 'a', analyte: 'crea', name: 'Creatinina', value: 1.8, unit: 'mg/dL', refLow: 0.5, refHigh: 1.5, text: undefined, note: undefined }]);
    expect(valuesFromRows([{ ...empty, value: 'abc' }]).errors[0]).toMatch(/no es un número/);
    expect(valuesFromRows([{ ...empty, value: '50', refLow: '100', refHigh: '10' }]).errors[0]).toMatch(/mayor que el máximo/);
  });

  it('recuerda los rangos por especie, laboratorio y valor', () => {
    const r = rangesToRemember([{ id: 'a', analyte: 'crea', name: 'Creatinina', value: 1.8, unit: 'mg/dL', refLow: 0.5, refHigh: 1.5 }, { id: 'b', analyte: 'alt', name: 'ALT', value: 50 }], 'perro', 'Laboratorio Ñuñoa');
    expect(r).toEqual({ [rangeKey('perro', 'laboratorio nunoa', 'crea')]: { low: 0.5, high: 1.5, unit: 'mg/dL' } });
  });
});

describe('evolución de valores', () => {
  const e1 = exam('2026-01-10', [{ analyte: 'crea', value: 1.2, refLow: 0.5, refHigh: 1.5 }, { analyte: 'wbc', value: 9500, unit: '/µL' }], { lab: 'Lab A' });
  const e2 = exam('2026-04-02', [{ analyte: 'crea', value: 1.9, refLow: 0.5, refHigh: 1.5 }, { analyte: 'neut', value: 70, unit: '%' }, { analyte: 'wbc', value: 14.2 }], { lab: 'Lab B' });
  const e3 = exam('2026-09-20', [{ analyte: 'crea', value: 2.4, refLow: 0.6, refHigh: 1.6 }, { analyte: 'neut', value: 8.1 }]);
  const cancelled = exam('2026-10-01', [{ analyte: 'crea', value: 9 }], { status: 'cancelled' });
  const empty = exam('2026-10-05', []);

  it('arma la tabla por valor y examen, del más reciente al más antiguo', () => {
    const t = buildTrends([e1, e2, e3, cancelled, empty]);
    expect(t.exams.map((e) => e.id)).toEqual([e3.id, e2.id, e1.id]);
    const crea = t.rows.find((r) => r.code === 'crea')!;
    expect(rowSeries(crea, t.exams).map((c) => [c.value, c.flag])).toEqual([
      [1.2, 'normal'],
      [1.9, 'high'],
      [2.4, 'high'],
    ]);
    expect(crea.anyOut).toBe(true);
    // Recuentos en /µL y ×10³/µL se comparan en la misma fila; % va en otra fila.
    const wbc = t.rows.filter((r) => r.code === 'wbc');
    expect(wbc).toHaveLength(1);
    expect(rowSeries(wbc[0], t.exams).map((c) => c.value)).toEqual([9.5, 14.2]);
    expect(t.rows.filter((r) => r.code === 'neut').map((r) => r.unit).sort()).toEqual(['%', '×10³/µL']);
  });

  it('calcula la variación y el valor anterior para el formulario', () => {
    expect(deltaOf(2.4, 1.9)).toEqual({ abs: 2.4 - 1.9, pct: ((2.4 - 1.9) / 1.9) * 100 });
    expect(deltaOf(undefined, 1)).toBeNull();
    const prev = previousValue([e1, e2, e3], { excludeExamId: e3.id, analyte: 'crea', unit: 'mg/dL', beforeOrOn: '2026-09-20' });
    expect(prev).toMatchObject({ value: 1.9, date: '2026-04-02' });
    expect(previousValue([e1, e2, e3], { analyte: 'wbc', unit: '×10³/µL', beforeOrOn: '2026-03-01' })).toMatchObject({ value: 9.5 });
    expect(previousValue([e1], { analyte: 'crea', unit: 'µmol/L', beforeOrOn: '2026-12-31' })).toBeNull();
  });

  it('expresa el rango en la unidad de la fila', () => {
    const a = exam('2026-02-01', [{ analyte: 'plt', value: 250000, unit: '/µL', refLow: 200000, refHigh: 500000 }]);
    const t = buildTrends([a]);
    const row = t.rows[0];
    expect(row.unit).toBe('/µL');
    const b = exam('2026-03-01', [{ analyte: 'plt', value: 180, refLow: 200, refHigh: 500 }]);
    const t2 = buildTrends([a, b]);
    const row2 = t2.rows[0];
    expect(row2.unit).toBe('×10³/µL');
    expect(cellRange(row2, row2.cells.get(a.id)!)).toEqual({ low: 200, high: 500 });
    expect(rowSeries(row2, t2.exams).map((c) => [c.value, c.flag])).toEqual([
      [250, 'normal'],
      [180, 'low'],
    ]);
  });
});
