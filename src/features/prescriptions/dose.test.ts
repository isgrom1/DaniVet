import { describe, expect, it } from 'vitest';
import { calculateDose } from './dose';

describe('calculadora de dosis', () => {
  it('calcula volumen por administración, frecuencia y total (mg/kg con mg/mL)', () => {
    const r = calculateDose({ weightKg: 12.4, dose: 5, doseUnit: 'mg/kg', concentration: 50, concUnit: 'mg/mL', everyHours: 12, durationDays: 7 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dosePerAdmin).toEqual({ value: 62, unit: 'mg' });
    expect(r.amountPerAdmin).toBeCloseTo(1.24, 6);
    expect(r.amountUnit).toBe('mL');
    expect(r.adminsPerDay).toBe(2);
    expect(r.administrations).toBe(14);
    expect(r.total).toBeCloseTo(17.36, 6);
    expect(r.steps.join(' ')).toContain('12,4 kg');
  });

  it('convierte µg/kg a mg y calcula comprimidos', () => {
    const r = calculateDose({ weightKg: 20, dose: 500, doseUnit: 'µg/kg', concentration: 10, concUnit: 'mg/comprimido', everyHours: 24, durationDays: 5 });
    expect(r.ok && r.amountPerAdmin).toBe(1); // 500 µg × 20 = 10 mg → 1 comprimido
    expect(r.ok && r.amountUnit).toBe('comprimido');
    expect(r.ok && r.total).toBe(5);
  });

  it('interpreta % como p/v (1 % = 10 mg/mL) y lo muestra en los pasos', () => {
    const r = calculateDose({ weightKg: 4, dose: 2, doseUnit: 'mg/kg', concentration: 2, concUnit: '%' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amountPerAdmin).toBeCloseTo(0.4, 6); // 8 mg ÷ 20 mg/mL
    expect(r.steps.some((s) => s.includes('20 mg/mL'))).toBe(true);
  });

  it('se detiene si falta el peso para una dosis por kilo', () => {
    const r = calculateDose({ dose: 5, doseUnit: 'mg/kg', concentration: 50, concUnit: 'mg/mL' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/peso/i);
  });

  it('se detiene con unidades incompatibles (UI frente a mg/mL)', () => {
    const r = calculateDose({ weightKg: 10, dose: 100, doseUnit: 'UI/kg', concentration: 50, concUnit: 'mg/mL' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/no son compatibles/);
  });

  it('rechaza valores no válidos', () => {
    const r = calculateDose({ weightKg: -3, dose: 0, doseUnit: 'mg/kg' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('dosis fija sin concentración: informa que no puede calcular volumen', () => {
    const r = calculateDose({ dose: 250, doseUnit: 'mg', everyHours: 8 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amountPerAdmin).toBe(250);
    expect(r.amountUnit).toBe('mg');
    expect(r.warnings.join(' ')).toMatch(/concentración/);
    expect(r.warnings.join(' ')).toMatch(/duración/);
  });

  it('cuenta administraciones con intervalos que no dividen el día', () => {
    const r = calculateDose({ weightKg: 10, dose: 1, doseUnit: 'mg/kg', concentration: 10, concUnit: 'mg/mL', everyHours: 36, durationDays: 5 });
    expect(r.ok && r.administrations).toBe(4);
  });
});
