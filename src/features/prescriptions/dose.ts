import { formatDecimal } from '@/lib/numbers';

/**
 * Calculadora de dosis con verificación de unidades.
 *
 * La app NO sugiere dosis ni medicamentos: solo realiza la aritmética con los datos que ingresa la profesional,
 * muestra cada paso y se detiene si faltan datos esenciales o las unidades no son compatibles.
 */
export const DOSE_UNITS = ['mg/kg', 'µg/kg', 'g/kg', 'UI/kg', 'mL/kg', 'mg', 'µg', 'g', 'UI', 'mL', 'comprimido', 'cápsula', 'gota', 'pipeta'] as const;
export type DoseUnit = (typeof DOSE_UNITS)[number];

export const CONC_UNITS = ['mg/mL', 'µg/mL', 'g/mL', 'UI/mL', '%', 'mg/comprimido', 'µg/comprimido', 'mg/cápsula'] as const;
export type ConcUnit = (typeof CONC_UNITS)[number];

type Dim = 'mass' | 'iu' | 'volume' | 'unit';

const DOSE_INFO: Record<DoseUnit, { dim: Dim; perKg: boolean; toBase: number; unit: string }> = {
  'mg/kg': { dim: 'mass', perKg: true, toBase: 1, unit: 'mg' },
  'µg/kg': { dim: 'mass', perKg: true, toBase: 0.001, unit: 'µg' },
  'g/kg': { dim: 'mass', perKg: true, toBase: 1000, unit: 'g' },
  'UI/kg': { dim: 'iu', perKg: true, toBase: 1, unit: 'UI' },
  'mL/kg': { dim: 'volume', perKg: true, toBase: 1, unit: 'mL' },
  mg: { dim: 'mass', perKg: false, toBase: 1, unit: 'mg' },
  µg: { dim: 'mass', perKg: false, toBase: 0.001, unit: 'µg' },
  g: { dim: 'mass', perKg: false, toBase: 1000, unit: 'g' },
  UI: { dim: 'iu', perKg: false, toBase: 1, unit: 'UI' },
  mL: { dim: 'volume', perKg: false, toBase: 1, unit: 'mL' },
  comprimido: { dim: 'unit', perKg: false, toBase: 1, unit: 'comprimido' },
  cápsula: { dim: 'unit', perKg: false, toBase: 1, unit: 'cápsula' },
  gota: { dim: 'unit', perKg: false, toBase: 1, unit: 'gota' },
  pipeta: { dim: 'unit', perKg: false, toBase: 1, unit: 'pipeta' },
};

/** Concentración: numerador (en unidad base: mg o UI) por cada unidad del denominador (mL, comprimido, cápsula). */
const CONC_INFO: Record<ConcUnit, { num: 'mass' | 'iu'; toBase: number; per: 'mL' | 'comprimido' | 'cápsula' }> = {
  'mg/mL': { num: 'mass', toBase: 1, per: 'mL' },
  'µg/mL': { num: 'mass', toBase: 0.001, per: 'mL' },
  'g/mL': { num: 'mass', toBase: 1000, per: 'mL' },
  'UI/mL': { num: 'iu', toBase: 1, per: 'mL' },
  '%': { num: 'mass', toBase: 10, per: 'mL' }, // % p/v: 1 % = 1 g/100 mL = 10 mg/mL
  'mg/comprimido': { num: 'mass', toBase: 1, per: 'comprimido' },
  'µg/comprimido': { num: 'mass', toBase: 0.001, per: 'comprimido' },
  'mg/cápsula': { num: 'mass', toBase: 1, per: 'cápsula' },
};

export interface DoseInput {
  weightKg?: number | null;
  dose: number | null;
  doseUnit: DoseUnit;
  concentration?: number | null;
  concUnit?: ConcUnit;
  everyHours?: number | null;
  durationDays?: number | null;
}

export interface DoseOk {
  ok: true;
  /** Cantidad a administrar cada vez (en la unidad de la presentación si hay concentración). */
  amountPerAdmin: number;
  amountUnit: string;
  /** Dosis por administración en unidad de masa/UI (si corresponde). */
  dosePerAdmin?: { value: number; unit: string };
  adminsPerDay?: number;
  administrations?: number;
  total?: number;
  steps: string[];
  warnings: string[];
}

export interface DoseErr {
  ok: false;
  errors: string[];
}

const n = (x: number, d = 3) => formatDecimal(x, d);
const valid = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

/** Expresa una masa en mg con la unidad más legible. */
function fmtMass(mg: number): { value: number; unit: string } {
  if (mg < 1) return { value: mg * 1000, unit: 'µg' };
  if (mg >= 1000) return { value: mg / 1000, unit: 'g' };
  return { value: mg, unit: 'mg' };
}

export function calculateDose(input: DoseInput): DoseOk | DoseErr {
  const errors: string[] = [];
  const warnings: string[] = [];
  const steps: string[] = [];
  const info = DOSE_INFO[input.doseUnit];
  if (!info) return { ok: false, errors: ['Unidad de dosis no reconocida.'] };
  if (!valid(input.dose)) errors.push('Falta la dosis indicada (número mayor que 0).');
  if (info.perKg && !valid(input.weightKg)) errors.push('Falta el peso del paciente (kg): la dosis está expresada por kilo.');
  if (input.concentration !== undefined && input.concentration !== null && !valid(input.concentration)) errors.push('La concentración debe ser un número mayor que 0.');
  if (input.everyHours !== undefined && input.everyHours !== null && !valid(input.everyHours)) errors.push('El intervalo entre dosis debe ser un número de horas mayor que 0.');
  if (input.durationDays !== undefined && input.durationDays !== null && !valid(input.durationDays)) errors.push('La duración debe ser un número de días mayor que 0.');
  if (errors.length) return { ok: false, errors };

  const dose = input.dose as number;
  // 1) Dosis por administración
  let perAdminBase: number; // mg, UI, mL o unidades
  if (info.perKg) {
    const w = input.weightKg as number;
    perAdminBase = dose * w * info.toBase;
    steps.push(`Peso utilizado: ${n(w, 2)} kg × dosis ${n(dose)} ${input.doseUnit} = ${n(dose * w)} ${info.unit} por administración.`);
  } else {
    perAdminBase = dose * info.toBase;
    steps.push(`Dosis fija por administración: ${n(dose)} ${info.unit}.`);
  }

  let amount = perAdminBase;
  let amountUnit = info.dim === 'mass' ? 'mg' : info.dim === 'iu' ? 'UI' : info.dim === 'volume' ? 'mL' : info.unit;
  let dosePerAdmin: DoseOk['dosePerAdmin'];
  if (info.dim === 'mass') {
    dosePerAdmin = fmtMass(perAdminBase);
    amount = dosePerAdmin.value;
    amountUnit = dosePerAdmin.unit;
    if (info.unit !== 'mg') steps.push(`Equivale a ${n(perAdminBase)} mg.`);
  } else if (info.dim === 'iu') dosePerAdmin = { value: perAdminBase, unit: 'UI' };

  // 2) Conversión con la concentración de la presentación
  if (valid(input.concentration) && input.concUnit) {
    const c = CONC_INFO[input.concUnit];
    if (!c) return { ok: false, errors: ['Unidad de concentración no reconocida.'] };
    const concBase = (input.concentration as number) * c.toBase;
    if (info.dim === 'volume' || info.dim === 'unit') {
      warnings.push('La dosis ya está expresada en volumen o unidades de presentación: la concentración no se usó en el cálculo.');
    } else if ((info.dim === 'mass' && c.num !== 'mass') || (info.dim === 'iu' && c.num !== 'iu')) {
      return {
        ok: false,
        errors: [
          `Las unidades no son compatibles: la dosis está en ${info.dim === 'mass' ? 'masa (mg, µg o g)' : 'unidades internacionales (UI)'} y la concentración en ${input.concUnit}. Revisa la presentación del medicamento.`,
        ],
      };
    } else {
      amount = perAdminBase / concBase;
      amountUnit = c.per;
      const numUnit = c.num === 'mass' ? 'mg' : 'UI';
      if (input.concUnit === '%') steps.push(`Concentración ${n(input.concentration as number)} % p/v = ${n(concBase)} mg/mL.`);
      steps.push(
        `${n(perAdminBase)} ${numUnit} ÷ ${n(concBase)} ${numUnit}/${c.per} = ${n(amount)} ${c.per}${c.per !== 'mL' && amount !== 1 ? 's' : ''} por administración.`,
      );
      if (c.per !== 'mL' && Math.abs(amount - Math.round(amount * 4) / 4) > 1e-9) {
        warnings.push('El resultado no corresponde a una fracción simple de comprimido o cápsula. Evalúa si la presentación es adecuada.');
      }
    }
  } else if (info.dim === 'mass' || info.dim === 'iu') {
    warnings.push('Sin concentración de la presentación no se puede calcular volumen ni número de comprimidos.');
  }

  // 3) Frecuencia y duración
  let adminsPerDay: number | undefined;
  let administrations: number | undefined;
  let total: number | undefined;
  if (valid(input.everyHours)) {
    adminsPerDay = 24 / input.everyHours;
    steps.push(`Frecuencia: cada ${n(input.everyHours, 1)} h = ${n(adminsPerDay, 2)} administración(es) al día.`);
    if (valid(input.durationDays)) {
      administrations = Math.ceil((input.durationDays * 24) / input.everyHours - 1e-9);
      total = administrations * amount;
      steps.push(`Duración: ${n(input.durationDays, 1)} día(s) → ${administrations} administración(es).`);
      steps.push(`Cantidad total: ${administrations} × ${n(amount)} ${amountUnit} = ${n(total)} ${amountUnit}.`);
    } else {
      warnings.push('Sin duración no se puede calcular la cantidad total.');
    }
  } else if (valid(input.durationDays)) {
    warnings.push('Sin frecuencia (cada cuántas horas) no se puede calcular la cantidad total.');
  }

  return { ok: true, amountPerAdmin: amount, amountUnit, dosePerAdmin, adminsPerDay, administrations, total, steps, warnings };
}

export function unitLabel(unit: string, qty: number): string {
  if (unit === 'comprimido' || unit === 'cápsula' || unit === 'gota' || unit === 'pipeta') return qty === 1 ? unit : `${unit}s`;
  return unit;
}
