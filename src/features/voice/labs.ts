import { ANALYTES, type AnalyteDef } from '@/features/exams/analytes';
import { findNumber, fold, tidy } from './text';

/**
 * Interpreta valores de laboratorio dictados o pegados ("hematocrito 45, plaquetas 250 mil, creatinina 1,8
 * referencia 0,5 a 1,5"). Solo toma lo que se dijo: nunca agrega rangos de referencia por su cuenta.
 */

export interface ParsedLabValue {
  code: string;
  name: string;
  value?: number;
  text?: string;
  unit: string;
  refLow?: number;
  refHigh?: number;
  /** Lo que se dijo además del valor ("levemente bajo"): queda como nota. */
  note?: string;
  source: string;
  warning?: string;
}

const ALIASES = ANALYTES.flatMap((def) => def.aliases.map((alias) => ({ alias, def }))).sort((a, b) => b.alias.length - a.alias.length);

/**
 * Lo que puede ir entre el nombre y el valor: dos puntos, puntos de relleno ("Hematocrito ..... 45"),
 * una sigla entre paréntesis ("ALT (GPT) 85") o palabras de enlace del dictado ("glucosa de 110").
 */
// Nunca cruza a otra línea: en un informe pegado, el valor de un examen está en la misma línea que su nombre.
const LEAD = /^[ \t:=._…]*(?:\([^)\n]{0,30}\)[ \t:=._…]*)?(?:(?:de|es|en|fue|dio)[ \t]+)?/;
/** Número con puntos de miles ("250.000", "1.250,5") o decimal simple ("12,5", "38.5"). */
const NUM_SRC = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)';
const NUM = new RegExp(`^${NUM_SRC}`);
const RANGE_SEP = '\\s*(?:-|–|—|a|al|hasta)\\s*';
/** Rango con palabra clave ("referencia 0,5 a 1,5") o tal como viene en un informe ("0,5 - 1,5", "(37 - 55)"). */
const RANGE_KEYWORD = new RegExp(
  `^[\\s,;(\\[]*(?:(?:valor(?:es)? de )?ref(?:erencia)?s?\\.?|rango(?: de referencia)?|intervalo(?: de referencia)?|v\\.?r\\.?|normal(?:es)?)\\s*:?\\s*(?:de |entre )?${NUM_SRC}${RANGE_SEP}${NUM_SRC}\\s*[)\\]]?`,
);
const RANGE_BARE = new RegExp(`^[\\s,;]*[(\\[]?\\s*${NUM_SRC}${RANGE_SEP}${NUM_SRC}\\s*[)\\]]?`);
const RANGE_MAX = new RegExp(`^[\\s,;]*[(\\[]?\\s*(?:<=?|≤|menor (?:a|de|que)|hasta|inferior a)\\s*${NUM_SRC}\\s*[)\\]]?`);
const RANGE_MIN = new RegExp(`^[\\s,;]*[(\\[]?\\s*(?:>=?|≥|mayor (?:a|de|que)|superior a)\\s*${NUM_SRC}\\s*[)\\]]?`);
/** Marcas de alto o bajo que algunos informes ponen junto al valor ("1,8 H", "1,8 *"). */
const FLAG = /^\s*(?:\*+|↑|↓|\(?[hl]\)?)(?![a-z0-9])/;

const MU = '[µμu]';
const VOL = `(?:${MU}l|mm3|mm³)`;
const POW = (n: string) => `(?:x\\s?)?10\\s?(?:\\^|e)?\\s?(?:${n})`;
/** Unidades como aparecen en informes o dictados, con su forma de la app. */
const UNITS: Array<[RegExp, string]> = (
  [
    ['%|por ?ciento', '%'],
    [`(?:${POW('3|³')}|k|mil(?:es)?)\\s?\\/\\s?${VOL}`, '×10³/µL'],
    [`${POW('9|⁹')}\\s?\\/\\s?l`, '×10³/µL'],
    [`(?:${POW('6|⁶')}|m|mill(?:ones)?)\\s?\\/\\s?${VOL}`, '×10⁶/µL'],
    [`${POW('12|¹²')}\\s?\\/\\s?l`, '×10⁶/µL'],
    [`\\/\\s?${VOL}|por (?:microlitro|milimetro cubico)`, '/µL'],
    ['mg\\/dl|miligramos? por decilitro', 'mg/dL'],
    ['g\\/dl|gramos? por decilitro', 'g/dL'],
    [`(?:${MU}g|mcg)\\/dl`, 'µg/dL'],
    [`(?:${MU}g|mcg)\\/l`, 'µg/L'],
    [`${MU}mol\\/l`, 'µmol/L'],
    ['nmol\\/l', 'nmol/L'],
    ['mmol\\/l', 'mmol/L'],
    ['meq\\/l', 'mEq/L'],
    ['u\\/l|ui\\/l|unidades? por litro', 'U/L'],
    ['ng\\/ml', 'ng/mL'],
    ['mg\\/l', 'mg/L'],
    ['g\\/l', 'g/L'],
    ['fl|femtolitros?', 'fL'],
    ['pg|picogramos?', 'pg'],
  ] as Array<[string, string]>
).map(([re, unit]) => [new RegExp(`^\\s*(?:${re})(?![a-z0-9])`), unit]);

const COUNT_FACTOR: Record<string, number> = { '/µL': 1, '×10³/µL': 1e3, '×10⁶/µL': 1e6 };

const QUALITATIVE: Array<[RegExp, string]> = [
  [/^(?:negativ[oa]s?|neg|ausentes?|no se detecta)/, 'Negativo'],
  [/^(?:trazas?|indicios)/, 'Trazas'],
  [/^(?:cuatro cruces|4 ?\+|\+\+\+\+)/, '++++'],
  [/^(?:tres cruces|3 ?\+|\+\+\+)/, '+++'],
  [/^(?:dos cruces|2 ?\+|\+\+)/, '++'],
  [/^(?:una cruz|1 ?\+|\+|positiv[oa])/, '+'],
];

function toNumber(raw: string, def: AnalyteDef): number {
  if (def.code === 'usg') {
    // Densidad: "1.025", "1,025" o "1025".
    const n = Number(raw.replace(',', '.'));
    return n > 100 ? n / 1000 : n;
  }
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) return Number(raw.replace(/\./g, '').replace(',', '.'));
  return Number(raw.replace(',', '.'));
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const hasContent = (s: string) => fold(s).replace(/[^a-z0-9]/g, '').length > 2;

/** Líneas con contenido (lo que no se reconoció se muestra por línea, no pegado a otro valor). */
function lines(text: string): string[] {
  return text
    .split(/\n+/)
    .map(tidy)
    .filter(hasContent);
}

export function parseLabDictation(text: string): { values: ParsedLabValue[]; unplaced: string[] } {
  const folded = fold(text);
  const found: Array<{ start: number; end: number; def: AnalyteDef }> = [];
  for (const { alias, def } of ALIASES) {
    // Sin "lookbehind" en la expresión, por compatibilidad con versiones antiguas de Safari.
    const re = new RegExp(`(^|[^a-z0-9])(${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![a-z0-9])`, 'g');
    for (let m = re.exec(folded); m; m = re.exec(folded)) {
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      const after = folded.slice(end);
      const lead = LEAD.exec(after)![0];
      const rest = after.slice(lead.length);
      const ok = def.qualitative ? QUALITATIVE.some(([q]) => q.test(rest)) : NUM.test(rest) || (findNumber(rest.slice(0, 40))?.index ?? -1) === 0;
      if (ok) found.push({ start, end, def });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const chosen: typeof found = [];
  for (const f of found) if (!chosen.length || f.start >= chosen[chosen.length - 1].end) chosen.push(f);

  const values: ParsedLabValue[] = [];
  const unplaced: string[] = lines(text.slice(0, chosen[0]?.start ?? text.length));

  chosen.forEach((c, i) => {
    const end = chosen[i + 1]?.start ?? text.length;
    const def = c.def;
    const segF = folded.slice(c.end, end);
    const segT = text.slice(c.end, end);
    let pos = LEAD.exec(segF)![0].length;
    // La frase de origen y la nota llegan solo hasta el fin de la línea; lo que sigue en otras líneas se informa aparte.
    const nl = segT.indexOf('\n', pos);
    const lineEnd = nl >= 0 ? nl : segT.length;
    const out: ParsedLabValue = { code: def.code, name: def.name, unit: def.unit, source: tidy(text.slice(c.start, c.end + lineEnd)) };
    const skip = (re: RegExp) => {
      const m = re.exec(segF.slice(pos, lineEnd));
      if (m) pos += m[0].length;
      return m;
    };
    if (def.qualitative) {
      const q = QUALITATIVE.map(([re, label]) => ({ m: re.exec(segF.slice(pos)), label })).find((x) => x.m);
      if (!q?.m) return;
      out.text = q.label;
      pos += q.m[0].length;
    } else {
      const m = NUM.exec(segF.slice(pos));
      let value: number;
      if (m) {
        value = toNumber(m[1], def);
        pos += m[0].length;
      } else {
        const w = findNumber(segF.slice(pos, pos + 40));
        if (!w || w.index !== 0) return;
        value = w.value;
        pos += w.length;
      }
      const mult = skip(/^\s*(mil(?:es)?|millones?)(?![a-z])(?!\s?\/)/);
      if (mult) value *= mult[1].startsWith('millon') ? 1e6 : 1e3;
      skip(FLAG);
      const readUnit = () => {
        for (const [re, unit] of UNITS) if (skip(re)) return unit;
        return undefined;
      };
      let unit = readUnit();
      skip(FLAG);
      // Rango: con palabra clave, tal como viene en un informe, o solo máximo / mínimo.
      let low: number | undefined;
      let high: number | undefined;
      const r = skip(RANGE_KEYWORD) ?? skip(RANGE_BARE);
      if (r) {
        low = toNumber(r[1], def);
        high = toNumber(r[2], def);
      } else {
        const mx = skip(RANGE_MAX);
        const mn = mx ? null : skip(RANGE_MIN);
        if (mx) high = toNumber(mx[1], def);
        if (mn) low = toNumber(mn[1], def);
      }
      // Algunos informes ponen la unidad después del rango.
      if (!unit && (low !== undefined || high !== undefined)) unit = readUnit();
      skip(FLAG);

      // Recuentos: se expresan en la unidad del catálogo (los rangos con el mismo factor).
      let factor = 1;
      const catalogCount = COUNT_FACTOR[def.unit];
      if (unit && unit in COUNT_FACTOR && catalogCount) {
        factor = COUNT_FACTOR[unit] / catalogCount;
        if (factor !== 1) out.warning = `Informado en ${unit}: se registra en ${def.unit}.`;
        out.unit = def.unit;
      } else if (unit) {
        out.unit = unit;
      } else if (def.unit === '×10³/µL' && value >= 1000) {
        factor = 1e-3;
        out.warning = 'Recuento absoluto: se registra en ×10³/µL.';
      } else if (def.unit === '×10⁶/µL' && value >= 1e5) {
        factor = 1e-6;
        out.warning = 'Recuento absoluto: se registra en ×10⁶/µL.';
      }
      out.value = round(value * factor);
      if (low !== undefined && high !== undefined && low > high) [low, high] = [undefined, undefined];
      if (low !== undefined) out.refLow = round(low * factor);
      if (high !== undefined) out.refHigh = round(high * factor);
    }
    const note = tidy(segT.slice(pos, lineEnd).replace(/^[\s,;)]*(?:y|e)?\s+/i, ''));
    if (hasContent(note)) out.note = note;
    unplaced.push(...lines(segT.slice(lineEnd)));
    values.push(out);
  });
  return { values, unplaced };
}
