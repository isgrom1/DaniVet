/** Normaliza texto para búsquedas: minúsculas, sin tildes y con espacios simples. */
export function normalizeText(s: string | undefined | null): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Todas las palabras de la consulta deben aparecer en alguno de los campos. */
export function matchesQuery(query: string, ...fields: Array<string | undefined | null>): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const hay = normalizeText(fields.filter(Boolean).join(' '));
  return q.split(' ').every((w) => hay.includes(w));
}

function bigrams(s: string): string[] {
  const t = ` ${s} `;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Similitud de Dice (0 a 1) sobre bigramas de texto normalizado. */
export function similarity(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bx = bigrams(x);
  const by = bigrams(y);
  const counts = new Map<string, number>();
  for (const g of bx) counts.set(g, (counts.get(g) ?? 0) + 1);
  let inter = 0;
  for (const g of by) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      inter++;
      counts.set(g, c - 1);
    }
  }
  return (2 * inter) / (bx.length + by.length);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Mayúscula solo en la primera letra (en español, "Domingo, 11 de octubre"; no "De Octubre"). */
export function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase('es-CL') + s.slice(1) : s;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function isBlank(s: unknown): boolean {
  return s === undefined || s === null || (typeof s === 'string' && s.trim() === '');
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

export function isValidEmail(s: string | undefined | null): boolean {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}
