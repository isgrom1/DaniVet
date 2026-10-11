/**
 * Números en formato chileno: coma decimal ("12,5") y punto de miles ("25.000").
 * El teclado decimal del iPhone en español muestra coma; aceptamos coma o punto como separador decimal.
 */
export function parseDecimal(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    // "1.234,5" → miles con punto y decimal con coma
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(',', '.');
  }
  if (!/^[-+]?\d*\.?\d+$/.test(s) && !/^[-+]?\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Monto en pesos chilenos (entero). Acepta "25.000", "25000", "$25.000". Rechaza decimales. */
export function parseCLP(input: unknown): number | null {
  if (typeof input === 'number') return Number.isInteger(input) ? input : null;
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/[$\s]/g, '');
  if (!s) return null;
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(s)) return null;
  const n = Number(s.replace(/\./g, ''));
  return Number.isSafeInteger(n) ? n : null;
}

export function formatDecimal(n: number | null | undefined, maxFractionDigits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return n.toLocaleString('es-CL', { maximumFractionDigits: maxFractionDigits, useGrouping: false });
}

export function formatCLP(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
}

export function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
