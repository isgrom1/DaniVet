import { useMemo, useState } from 'react';
import { Calculator, CircleAlert, Info } from 'lucide-react';
import { Button } from '@/components/Button';
import { Checkbox, DecimalInput, Field, ProvenanceTag, Segmented, Select } from '@/components/form';
import { Notice } from '@/components/Card';
import { Sheet } from '@/components/overlay';
import type { DoseCalcRecord, MedicationRef } from '@/data/schema';
import { formatDate } from '@/lib/dates';
import { formatDecimal, parseDecimal } from '@/lib/numbers';
import { nowISO } from '@/lib/ids';
import { CONC_UNITS, DOSE_UNITS, calculateDose, unitLabel, type ConcUnit, type DoseUnit } from './dose';

export interface DoseApply {
  calc: DoseCalcRecord;
  doseText: string;
  frequencyText?: string;
  durationText?: string;
  totalText?: string;
  concentrationText?: string;
}

export function DoseCalculator({
  onClose,
  onApply,
  weights,
  med,
  medicationName,
}: {
  onClose: () => void;
  onApply: (r: DoseApply) => void;
  /** Pesos disponibles para elegir (consulta actual, último registrado). */
  weights: Array<{ label: string; kg: number; date?: string }>;
  med?: MedicationRef;
  medicationName?: string;
}) {
  const [weightChoice, setWeightChoice] = useState<string>(weights[0] ? '0' : 'manual');
  const [manualWeight, setManualWeight] = useState('');
  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<DoseUnit>('mg/kg');
  const [conc, setConc] = useState(med?.concentrationValue ? formatDecimal(med.concentrationValue, 4) : '');
  const [concUnit, setConcUnit] = useState<ConcUnit>((med?.concentrationUnit as ConcUnit) ?? 'mg/mL');
  const [everyHours, setEveryHours] = useState('');
  const [days, setDays] = useState('');
  const [reviewed, setReviewed] = useState(false);

  const w = weightChoice === 'manual' ? parseDecimal(manualWeight) : (weights[Number(weightChoice)]?.kg ?? null);
  const wSource = weightChoice === 'manual' ? 'Ingresado manualmente en el cálculo' : weights[Number(weightChoice)] ? `${weights[Number(weightChoice)].label}${weights[Number(weightChoice)].date ? ` (${formatDate(weights[Number(weightChoice)].date)})` : ''}` : '';

  const result = useMemo(
    () =>
      calculateDose({
        weightKg: w,
        dose: parseDecimal(dose),
        doseUnit,
        concentration: conc ? parseDecimal(conc) : null,
        concUnit,
        everyHours: everyHours ? parseDecimal(everyHours) : null,
        durationDays: days ? parseDecimal(days) : null,
      }),
    [w, dose, doseUnit, conc, concUnit, everyHours, days],
  );
  const touched = dose !== '';

  const apply = () => {
    if (!result.ok) return;
    const perKg = doseUnit.endsWith('/kg');
    const amount = `${formatDecimal(result.amountPerAdmin, 3)} ${unitLabel(result.amountUnit, result.amountPerAdmin)}`;
    const doseText = perKg
      ? `${amount} por administración (${formatDecimal(parseDecimal(dose)!, 3)} ${doseUnit} × ${formatDecimal(w!, 2)} kg${result.dosePerAdmin && result.amountUnit !== result.dosePerAdmin.unit ? ` = ${formatDecimal(result.dosePerAdmin.value, 3)} ${result.dosePerAdmin.unit}` : ''})`
      : `${amount} por administración`;
    const calc: DoseCalcRecord = {
      weightKg: perKg ? (w ?? undefined) : undefined,
      weightSource: perKg ? wSource : undefined,
      doseValue: parseDecimal(dose)!,
      doseUnit,
      concentrationValue: conc ? (parseDecimal(conc) ?? undefined) : undefined,
      concentrationUnit: conc ? concUnit : undefined,
      amountPerAdmin: result.amountPerAdmin,
      amountUnit: result.amountUnit,
      everyHours: everyHours ? (parseDecimal(everyHours) ?? undefined) : undefined,
      durationDays: days ? (parseDecimal(days) ?? undefined) : undefined,
      administrations: result.administrations,
      totalAmount: result.total,
      steps: result.steps,
      reviewedAt: nowISO(),
    };
    onApply({
      calc,
      doseText,
      frequencyText: everyHours ? `Cada ${formatDecimal(parseDecimal(everyHours)!, 1)} horas` : undefined,
      durationText: days ? `${formatDecimal(parseDecimal(days)!, 1)} días` : undefined,
      totalText: result.total !== undefined ? `${formatDecimal(result.total, 2)} ${unitLabel(result.amountUnit, result.total)} (${result.administrations} administraciones)` : undefined,
      concentrationText: conc ? `${conc} ${concUnit}` : undefined,
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Calculadora de dosis"
      size="full"
      footer={
        <div className="space-y-2">
          <Checkbox checked={reviewed} onChange={setReviewed} disabled={!result.ok} label="Revisé los datos, las unidades y el resultado. Asumo la indicación." />
          <Button block size="lg" disabled={!result.ok || !reviewed} onClick={apply} icon={<Calculator className="size-5" />}>
            Usar en la indicación
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Notice tone="info" icon={<Info className="size-5" />}>
          Ingresa la dosis según tu criterio clínico y la bibliografía. La app no sugiere dosis: solo calcula, muestra los pasos y verifica las unidades.
        </Notice>
        {(medicationName || med) && <p className="text-[15px] font-semibold">Medicamento: {medicationName || med?.name}</p>}

        <Field label="Peso utilizado" required tag={weightChoice === 'manual' ? <ProvenanceTag kind="professional" label="Ingresado ahora" /> : <ProvenanceTag kind="professional" label="Registrado" />}>
          <Select value={weightChoice} onChange={(e) => setWeightChoice(e.target.value)} aria-label="Origen del peso">
            {weights.map((x, i) => (
              <option key={i} value={String(i)}>
                {x.label}: {formatDecimal(x.kg, 2)} kg{x.date ? ` (${formatDate(x.date)})` : ''}
              </option>
            ))}
            <option value="manual">Ingresar otro peso</option>
          </Select>
          {weightChoice === 'manual' && <DecimalInput value={manualWeight} onChange={setManualWeight} unit="kg" placeholder="Peso en kg" className="mt-2" />}
        </Field>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Dosis indicada" required>
            <DecimalInput value={dose} onChange={(v) => { setDose(v); setReviewed(false); }} placeholder="Ej.: 5" />
          </Field>
          <Field label="Unidad">
            <Select value={doseUnit} onChange={(e) => { setDoseUnit(e.target.value as DoseUnit); setReviewed(false); }} aria-label="Unidad de dosis" className="w-36">
              {DOSE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Concentración de la presentación" hint={med?.concentrationValue ? 'Tomada de tus medicamentos frecuentes: verifícala con el envase.' : undefined}>
            <DecimalInput value={conc} onChange={(v) => { setConc(v); setReviewed(false); }} placeholder="Ej.: 50" />
          </Field>
          <Field label="Unidad">
            <Select value={concUnit} onChange={(e) => { setConcUnit(e.target.value as ConcUnit); setReviewed(false); }} aria-label="Unidad de concentración" className="w-36">
              {CONC_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u === '%' ? '% (p/v)' : u}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cada (horas)">
            <DecimalInput value={everyHours} onChange={(v) => { setEveryHours(v); setReviewed(false); }} unit="h" />
            <Segmented
              name="Intervalos frecuentes"
              size="sm"
              className="mt-1.5"
              value={everyHours as '8'}
              onChange={(v) => { setEveryHours(v); setReviewed(false); }}
              options={['6', '8', '12', '24'].map((h) => ({ value: h as '8', label: `${h} h` }))}
            />
          </Field>
          <Field label="Duración">
            <DecimalInput value={days} onChange={(v) => { setDays(v); setReviewed(false); }} unit="días" />
          </Field>
        </div>

        {touched && !result.ok && (
          <Notice tone="danger" icon={<CircleAlert className="size-5" />} title="Cálculo detenido">
            <ul className="list-disc pl-4">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </Notice>
        )}
        {result.ok && (
          <div className="card space-y-3 border-amber-200 bg-amber-50/60 p-4" data-testid="dose-result">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wide text-amber-900">Resultado</p>
              <ProvenanceTag kind="calculated" />
            </div>
            <p className="text-2xl font-bold tabular text-ink-900">
              {formatDecimal(result.amountPerAdmin, 3)} {unitLabel(result.amountUnit, result.amountPerAdmin)}
              <span className="ml-1 text-base font-medium text-ink-600">por administración</span>
            </p>
            {result.total !== undefined && (
              <p className="text-[15px] font-semibold text-ink-800">
                Total: {formatDecimal(result.total, 2)} {unitLabel(result.amountUnit, result.total)} ({result.administrations} administraciones)
              </p>
            )}
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-700">
              {result.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {result.warnings.map((wn, i) => (
              <p key={i} className="flex gap-1.5 text-sm text-amber-900">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> {wn}
              </p>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
