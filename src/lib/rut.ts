/** RUT chileno: validación por módulo 11 y formato 12.345.678-5. */
export function cleanRut(input: string): string {
  return input.replace(/[^0-9kK]/g, '').toUpperCase();
}

export function rutCheckDigit(body: string): string {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

export function isValidRut(input: string | undefined | null): boolean {
  if (!input) return false;
  const c = cleanRut(input);
  if (c.length < 2) return false;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  if (!/^\d{1,8}$/.test(body)) return false;
  return rutCheckDigit(body) === dv;
}

export function formatRut(input: string | undefined | null): string {
  if (!input) return '';
  const c = cleanRut(input);
  if (c.length < 2) return input;
  const body = c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${c.slice(-1)}`;
}
