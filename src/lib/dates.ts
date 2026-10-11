/**
 * Fechas.
 * - Fechas sin hora (nacimiento, vencimientos, próximas dosis): texto 'AAAA-MM-DD' en hora local, sin zona horaria.
 * - Instantes (inicio de una cita, creación de registros): ISO 8601 en UTC; se muestran en la hora local del dispositivo.
 */
const LOCALE = 'es-CL';

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDateISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toLocalDateISO(new Date());
}

export function isISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseLocalDate(s);
  return toLocalDateISO(d) === s;
}

export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + days);
  return toLocalDateISO(d);
}

/** Días desde `a` hasta `b` (b - a), ambos 'AAAA-MM-DD'. */
export function diffDays(a: string, b: string): number {
  const ms = parseLocalDate(b).getTime() - parseLocalDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDate(iso?: string | null, style: 'short' | 'long' | 'medium' = 'short'): string {
  if (!iso) return '';
  const d = iso.length === 10 ? parseLocalDate(iso) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (style === 'long') {
    return d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (style === 'medium') return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatTime(isoDateTime?: string | null): string {
  if (!isoDateTime) return '';
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDateTime(isoDateTime?: string | null): string {
  if (!isoDateTime) return '';
  return `${formatDate(isoDateTime)} ${formatTime(isoDateTime)}`;
}

export function weekdayShort(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString(LOCALE, { weekday: 'short' });
}

export function dayMonth(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

/** Valor para <input type="datetime-local"> a partir de un instante ISO. */
export function toDateTimeInput(isoDateTime?: string | null): string {
  if (!isoDateTime) return '';
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return '';
  return `${toLocalDateISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Instante ISO (UTC) a partir de fecha local 'AAAA-MM-DD' y hora 'HH:MM'. */
export function fromLocalDateTime(date: string, time: string): string | null {
  if (!isISODate(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  const d = parseLocalDate(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function localDateOf(isoDateTime: string): string {
  return toLocalDateISO(new Date(isoDateTime));
}

export function localTimeOf(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addMinutes(isoDateTime: string, minutes: number): string {
  return new Date(new Date(isoDateTime).getTime() + minutes * 60_000).toISOString();
}

export function startOfWeek(iso: string, weekStartsOn = 1): string {
  const d = parseLocalDate(iso);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toLocalDateISO(d);
}

/** Edad legible a partir de la fecha de nacimiento ('AAAA-MM-DD'). */
export function ageText(birthDate?: string | null, ref: string = todayISO(), estimated = false): string {
  if (!birthDate || !isISODate(birthDate)) return '';
  const b = parseLocalDate(birthDate);
  const r = parseLocalDate(ref);
  if (r < b) return '';
  let months = (r.getFullYear() - b.getFullYear()) * 12 + (r.getMonth() - b.getMonth());
  if (r.getDate() < b.getDate()) months--;
  const prefix = estimated ? '≈ ' : '';
  if (months < 1) {
    const days = diffDays(birthDate, ref);
    const weeks = Math.floor(days / 7);
    return weeks >= 1 ? `${prefix}${weeks} ${weeks === 1 ? 'semana' : 'semanas'}` : `${prefix}${days} ${days === 1 ? 'día' : 'días'}`;
  }
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${prefix}${rem} ${rem === 1 ? 'mes' : 'meses'}`;
  const y = `${years} ${years === 1 ? 'año' : 'años'}`;
  return rem ? `${prefix}${y} ${rem} ${rem === 1 ? 'mes' : 'meses'}` : `${prefix}${y}`;
}

/** Fecha de nacimiento aproximada a partir de una edad estimada en años y meses. */
export function birthDateFromAge(years: number, months: number, ref: string = todayISO()): string {
  const d = parseLocalDate(ref);
  d.setMonth(d.getMonth() - (years * 12 + months));
  return toLocalDateISO(d);
}

export function relativeDays(iso: string, ref: string = todayISO()): string {
  const n = diffDays(ref, iso);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  if (n > 0) return `en ${n} días`;
  return `hace ${-n} días`;
}
