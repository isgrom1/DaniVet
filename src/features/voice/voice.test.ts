import { describe, expect, it } from 'vitest';
import { getRecord, useDataStore } from '@/data/store';
import { freshAccount, makePatient, makeTutor } from '@/test/helpers';
import { addDays } from '@/lib/dates';
import { finalizeConsultation, saveConsultationDraft, startConsultation, type EditorState } from '@/features/consultations/actions';
import { finalizeBlockers, missingImportant, reviewDictatedOnEdit } from '@/features/consultations/model';
import { parseConsultationDictation, type ParsedItem } from './consultation';
import { applyDictation } from './apply';
import { findNumber, fold, segment, tidy } from './text';

const BASE = '2026-10-18';
const parse = (text: string, bcsScale: 5 | 9 = 9) => parseConsultationDictation(text, { baseDate: BASE, bcsScale, knownMeds: ['meloxicam'] });
const find = (items: ParsedItem[], label: string) => items.filter((i) => i.label === label);
const one = (items: ParsedItem[], label: string) => {
  const list = find(items, label);
  expect(list, label).toHaveLength(1);
  return list[0];
};

const FULL =
  'Motivo de consulta vómitos desde ayer y decaimiento. El tutor cuenta que comió basura el fin de semana. Peso 12,4 kilos. ' +
  'Temperatura 39,2 grados. Frecuencia cardíaca 120. Frecuencia respiratoria 32. Mucosas rosadas y húmedas. Llenado capilar 2 segundos. ' +
  'Deshidratación 5%. Condición corporal 5 de 9. Abdomen con dolor a la palpación en epigastrio. Corazón normal. Pulmones normales. ' +
  'Resto del examen normal. Diagnóstico presuntivo gastroenteritis por indiscreción alimentaria. Diagnóstico diferencial pancreatitis, cuerpo extraño. ' +
  'Solicito hemograma y perfil bioquímico. Tratamiento maropitant 1 mg por kilo subcutáneo cada 24 horas por 3 días. ' +
  'Omeprazol 1 mg/kg oral cada 12 horas por 7 días. Dieta blanda por 3 días. Control en 3 días.';

describe('texto dictado', () => {
  it('pliega sin cambiar el largo y lee números con cifras o palabras', () => {
    expect(fold('Ñandú ÉXITO')).toBe('nandu exito');
    expect(fold('Ñandú ÉXITO')).toHaveLength('Ñandú ÉXITO'.length);
    expect(findNumber('peso 12,4 kilos')?.value).toBe(12.4);
    expect(findNumber('38.5')?.value).toBe(38.5);
    expect(findNumber('38 y medio')?.value).toBe(38.5);
    expect(findNumber('treinta y ocho coma cinco')?.value).toBe(38.5);
    expect(findNumber('ciento veinte latidos')?.value).toBe(120);
    expect(findNumber('una semana')).toBeNull();
    expect(tidy('  dieta renal y ')).toBe('Dieta renal');
  });

  it('una palabra clave débil no corta una frase a la mitad', () => {
    const defs = [
      { key: 'motivo', re: 'motivo de consulta' },
      { key: 'abdomen', re: 'abdomen', weak: true },
    ];
    expect(segment('Motivo de consulta dolor de abdomen.', defs).segments.map((s) => s.key)).toEqual(['motivo']);
    expect(segment('Motivo de consulta vómitos. Abdomen doloroso.', defs).segments.map((s) => s.key)).toEqual(['motivo', 'abdomen']);
    expect(segment('Motivo de consulta vómitos abdomen normal', defs).segments.map((s) => s.key)).toEqual(['motivo', 'abdomen']);
  });
});

describe('dictado de la consulta', () => {
  it('reparte un dictado completo en los campos correctos', () => {
    const { items, unplaced } = parse(FULL);
    expect(unplaced).toEqual([]);
    expect(one(items, 'Motivo principal').display).toBe('Vómitos desde ayer y decaimiento');
    expect(one(items, 'Síntomas informados por el tutor').display).toBe('Comió basura el fin de semana');
    expect(one(items, 'Peso').change).toEqual({ kind: 'number', path: 'exam.weightKg', value: 12.4 });
    expect(one(items, 'Temperatura').change).toMatchObject({ value: 39.2 });
    expect(one(items, 'Frecuencia cardíaca').change).toMatchObject({ value: 120 });
    expect(one(items, 'Frecuencia respiratoria').change).toMatchObject({ value: 32 });
    expect(one(items, 'Llenado capilar (TLLC)').change).toMatchObject({ value: 2 });
    expect(one(items, 'Mucosas').change).toMatchObject({ status: 'normal', color: 'Rosadas', notes: 'Húmedas' });
    expect(one(items, 'Hidratación').change).toMatchObject({ status: 'abnormal', pct: 5 });
    expect(one(items, 'Condición corporal').change).toMatchObject({ value: 5, scale: 9 });
    expect(one(items, 'Digestivo y abdominal').change).toMatchObject({ status: 'abnormal', notes: 'Dolor a la palpación en epigastrio' });
    expect(one(items, 'Cardiovascular').change).toMatchObject({ status: 'normal' });
    expect(one(items, 'Respiratorio').change).toMatchObject({ status: 'normal' });
    expect(one(items, 'Resto de los sistemas').change).toEqual({ kind: 'restNormal' });
    expect(one(items, 'Diagnóstico presuntivo').display).toBe('Gastroenteritis por indiscreción alimentaria');
    expect(find(items, 'Diagnóstico diferencial').map((i) => i.display)).toEqual(['Pancreatitis', 'Cuerpo extraño']);
    expect(one(items, 'Exámenes solicitados').display).toBe('Hemograma y perfil bioquímico');
    const tx = find(items, 'Tratamiento').map((i) => i.change);
    expect(tx).toEqual([
      { kind: 'treatment', txKind: 'medication', name: 'Maropitant', dose: '1 mg/kg', route: 'SC', frequency: 'Cada 24 horas', durationDays: 3, instructions: undefined },
      { kind: 'treatment', txKind: 'medication', name: 'Omeprazol', dose: '1 mg/kg', route: 'Oral', frequency: 'Cada 12 horas', durationDays: 7, instructions: undefined },
    ]);
    // "Dieta blanda" dictada junto al plan es una indicación, no un antecedente de alimentación.
    expect(one(items, 'Cuidados domiciliarios').display).toBe('Dieta blanda por 3 días');
    expect(find(items, 'Alimentación')).toHaveLength(0);
    expect(one(items, 'Control recomendado').change).toEqual({ kind: 'controlDate', date: addDays(BASE, 3) });
    expect(items.every((i) => i.selected)).toBe(true);
  });

  it('no inventa valores: lo no dictado no aparece y lo imposible no se marca', () => {
    const { items, unplaced } = parse('Motivo control. Temperatura normal. Peso 3000 kilos. Frecuencia cardíaca 600.');
    expect(find(items, 'Temperatura')).toHaveLength(0);
    expect(unplaced).toContain('Temperatura normal');
    const peso = one(items, 'Peso');
    expect(peso.selected).toBe(false);
    expect(peso.warning).toMatch(/fuera de lo que admite/);
    expect(one(items, 'Frecuencia cardíaca').selected).toBe(false);
    // Ningún sistema se marca como normal si no se dictó.
    expect(items.filter((i) => i.change.kind === 'finding' || i.change.kind === 'restNormal')).toHaveLength(0);
  });

  it('no corta el motivo cuando menciona partes del cuerpo o el peso', () => {
    const { items } = parse('Motivo de consulta dolor de abdomen y pérdida de peso desde hace una semana. El tutor cuenta que bajó de peso.');
    expect(one(items, 'Motivo principal').display).toBe('Dolor de abdomen y pérdida de peso desde hace una semana');
    expect(one(items, 'Síntomas informados por el tutor').display).toBe('Bajó de peso');
    expect(find(items, 'Peso')).toHaveLength(0);
    expect(find(items, 'Digestivo y abdominal')).toHaveLength(0);
  });

  it('entiende un dictado sin puntuación con varios medicamentos', () => {
    const { items } = parse(
      'motivo de consulta tos hace 5 días peso 25 kilos temperatura 39 frecuencia cardiaca 100 mucosas rosadas pulmones con crepitaciones ' +
        'diagnóstico presuntivo traqueobronquitis tratamiento doxiciclina 10 mg por kilo oral cada 24 horas por 14 días y prednisolona 0,5 mg por kilo oral cada 24 horas por 5 días ' +
        'control en una semana',
    );
    expect(one(items, 'Motivo principal').display).toBe('Tos hace 5 días');
    expect(one(items, 'Peso').change).toMatchObject({ value: 25 });
    expect(one(items, 'Mucosas').change).toMatchObject({ color: 'Rosadas' });
    expect(one(items, 'Respiratorio').change).toMatchObject({ status: 'abnormal', notes: 'Crepitaciones' });
    expect(one(items, 'Diagnóstico presuntivo').display).toBe('Traqueobronquitis');
    expect(find(items, 'Tratamiento').map((i) => [i.change.kind === 'treatment' && i.change.name, i.change.kind === 'treatment' && i.change.durationDays])).toEqual([
      ['Doxiciclina', 14],
      ['Prednisolona', 5],
    ]);
    expect(one(items, 'Control recomendado').change).toEqual({ kind: 'controlDate', date: addDays(BASE, 7) });
  });

  it('números en palabras, gramos, soplos, "sin…" y la escala de condición corporal', () => {
    const { items } = parse(
      'Motivo prurito. Peso 8.200 gramos. Temperatura treinta y ocho coma cinco. Frecuencia cardíaca ciento veinte. Oídos sin secreción. ' +
        'Corazón normal. Soplo grado 2 de 6. Condición corporal 3 de 5.',
    );
    expect(one(items, 'Peso').change).toMatchObject({ value: 8.2 });
    expect(one(items, 'Temperatura').change).toMatchObject({ value: 38.5 });
    expect(one(items, 'Frecuencia cardíaca').change).toMatchObject({ value: 120 });
    expect(one(items, 'Oídos').change).toMatchObject({ status: 'normal', notes: 'Sin secreción' });
    // "Corazón normal" + "soplo…": se combinan en un hallazgo alterado.
    expect(one(items, 'Cardiovascular').change).toMatchObject({ status: 'abnormal', notes: 'Soplo grado 2 de 6' });
    const bcs = one(items, 'Condición corporal');
    expect(bcs.change).toMatchObject({ value: 3, scale: 5 });
    expect(bcs.selected).toBe(false);
    expect(bcs.warning).toMatch(/no se convierte/);
    expect(one(parse('Pesa 4 kilos 300 gramos.').items, 'Peso').change).toMatchObject({ value: 4.3 });
  });

  it('una frase sin palabra clave al comienzo se propone como motivo, sin marcar', () => {
    const { items } = parse('Perro con cojera hace una semana. Locomotor: dolor en rodilla derecha. Tratamiento meloxicam 0,1 mg/kg oral cada 24 horas por 5 días con comida. Reposo por 10 días.');
    const motivo = one(items, 'Motivo principal');
    expect(motivo.selected).toBe(false);
    expect(motivo.warning).toMatch(/motivo/);
    expect(one(items, 'Musculoesquelético').change).toMatchObject({ status: 'abnormal', notes: 'Dolor en rodilla derecha' });
    expect(one(items, 'Tratamiento').change).toMatchObject({ name: 'Meloxicam', dose: '0,1 mg/kg', route: 'Oral', durationDays: 5, instructions: 'Con comida' });
    expect(one(items, 'Indicación').change).toMatchObject({ txKind: 'other', name: 'Reposo', durationDays: 10 });
  });
});

describe('aplicar lo dictado', () => {
  async function draft(): Promise<EditorState> {
    await freshAccount();
    const t = await makeTutor();
    const p = await makePatient(t.id);
    const id = await startConsultation({ patientId: p.id });
    return { consultation: structuredClone(getRecord('consultations', id)!), diagnoses: [], treatments: [] };
  }

  it('agrega los datos marcados como dictados, guarda el texto y exige revisarlos antes de finalizar', async () => {
    let state = await draft();
    const before = missingImportant(state.consultation, state.diagnoses, state.treatments).map((m) => m.label);
    expect(before).toContain('Peso');
    expect(before).toContain('Diagnóstico');

    // Un hallazgo registrado antes no se pisa con "resto normal".
    state = { ...state, consultation: { ...state.consultation, exam: { ...state.consultation.exam, systems: { ...state.consultation.exam.systems, ocular: { status: 'abnormal', notes: 'Epífora' } } } } };
    const { items } = parse(FULL);
    const r = applyDictation(state, items, FULL);
    state = r.state;
    const c = state.consultation;
    expect(c.reason.main).toBe('Vómitos desde ayer y decaimiento');
    expect(c.exam.weightKg).toBe(12.4);
    expect(c.exam.systems.digestive).toEqual({ status: 'abnormal', notes: 'Dolor a la palpación en epigastrio' });
    expect(c.exam.systems.ocular).toEqual({ status: 'abnormal', notes: 'Epífora' });
    expect(c.exam.systems.neurological).toEqual({ status: 'normal' });
    expect(c.plan.controlDate).toBe(addDays(c.startedAt.slice(0, 10), 3));
    expect(state.diagnoses.map((d) => [d.kind, d.name])).toEqual([
      ['presumptive', 'Gastroenteritis por indiscreción alimentaria'],
      ['differential', 'Pancreatitis'],
      ['differential', 'Cuerpo extraño'],
    ]);
    expect(state.treatments).toHaveLength(2);
    expect(state.treatments[1].endDate).toBe(addDays(state.treatments[1].startDate!, 6));
    expect(c.dictations).toHaveLength(1);
    expect(c.dictations![0].text).toBe(FULL);
    expect(c.provenance.every((p) => p.source === 'dictated' && !p.reviewed)).toBe(true);
    expect(c.provenance.map((p) => p.path)).not.toContain('exam.systems.ocular');
    expect(missingImportant(c, state.diagnoses, state.treatments)).toEqual([]);

    // Se guarda (validado por el esquema) y no se puede finalizar sin revisar.
    await saveConsultationDraft(state);
    const saved = getRecord('consultations', c.id)!;
    expect(saved.exam.temperatureC).toBe(39.2);
    expect(saved.dictations).toHaveLength(1);
    expect(finalizeBlockers(saved).join(' ')).toMatch(/dictado\(s\) sin revisar/);
    await expect(finalizeConsultation(state)).rejects.toThrow(/sin revisar/);

    // Editar un dato dictado lo deja revisado; el resto se revisa explícitamente.
    const edited = reviewDictatedOnEdit(state.consultation, 'exam.mucous.color');
    expect(edited.provenance.find((p) => p.path === 'exam.mucous')?.reviewed).toBe(true);
    state = { ...state, consultation: { ...edited, provenance: edited.provenance.map((p) => ({ ...p, reviewed: true })) } };
    await finalizeConsultation(state);
    expect(getRecord('consultations', c.id)!.status).toBe('final');
    expect([...useDataStore.getState().tables.treatments.values()].filter((t) => t.consultationId === c.id)).toHaveLength(2);
  });

  it('no repite diagnósticos ni tratamientos al dictar dos veces', async () => {
    let state = await draft();
    const text = 'Diagnóstico presuntivo otitis externa. Tratamiento Otomax 4 gotas cada 12 horas por 7 días.';
    state = applyDictation(state, parse(text).items, text).state;
    state = applyDictation(state, parse(text).items, text).state;
    expect(state.diagnoses).toHaveLength(1);
    expect(state.treatments).toHaveLength(1);
    expect(state.consultation.dictations).toHaveLength(2);
  });

  it('agrega texto a lo existente y respeta lo que no se marcó', async () => {
    let state = await draft();
    state = { ...state, consultation: { ...state.consultation, anamnesis: { ...state.consultation.anamnesis, diet: 'Pellet' } } };
    const { items } = parse('Alimentación come también comida casera. Peso 10 kilos.');
    const unselected = items.map((i) => (i.label === 'Peso' ? { ...i, selected: false } : i));
    state = applyDictation(state, unselected, 'x').state;
    expect(state.consultation.anamnesis.diet).toBe('Pellet. Come también comida casera');
    expect(state.consultation.exam.weightKg).toBeUndefined();
    expect(state.consultation.provenance.map((p) => p.path)).toEqual(['anamnesis.diet']);
  });
});
