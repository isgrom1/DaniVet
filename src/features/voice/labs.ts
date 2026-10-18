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

const LEAD = /^[\s:=]*(?:(?:de|es|en|fue|dio)\s+)?/;
/** Número con puntos de miles ("250.000", "1.250,5") o decimal simple ("12,5", "38.5"). */
const NUM = /^(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/;
const RANGE_NUM = '(\\d+(?:[.,]\\d+)?)';
const RANGE = new RegExp(
  `^[\\s,;(]*(?:(?:valor(?:es)? de )?ref(?:erencia)?s?|rango(?: de referencia)?|vr|normal(?:es)?)\\s*:?\\s*(?:de |entre )?${RANGE_NUM}\\s*(?:a|al|-|–|y|hasta)\\s*${RANGE_NUM}\\s*\\)?`,
);
const UNIT_WORDS =
  /^\s*(?:mg\/dl|g\/dl|g\/l|u\/l|ui\/l|mmol\/l|µmol\/l|umol\/l|mEq\/l|meq\/l|fl|pg|µg\/dl|ug\/dl|µg\/l|ug\/l|nmol\/l|x ?10\^?[36]\/µl|miligramos? por decilitro|gramos? por decilitro|unidades? por litro|femtolitros?|picogramos?)(?![a-z])/;
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
  const unplaced: string[] = [];
  const lead = tidy(text.slice(0, chosen[0]?.start ?? text.length));
  if (fold(lead).replace(/[^a-z0-9]/g, '').length > 2) unplaced.push(lead);

  chosen.forEach((c, i) => {
    const end = chosen[i + 1]?.start ?? text.length;
    const def = c.def;
    const segF = folded.slice(c.end, end);
    const segT = text.slice(c.end, end);
    let pos = LEAD.exec(segF)![0].length;
    const out: ParsedLabValue = { code: def.code, name: def.name, unit: def.unit, source: tidy(text.slice(c.start, end)) };
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
      const mult = /^\s*(mil(?:es)?|millones?)(?![a-z])/.exec(segF.slice(pos));
      if (mult) {
        value *= mult[1].startsWith('mil') && !mult[1].startsWith('millon') ? 1e3 : 1e6;
        pos += mult[0].length;
      }
      const pct = /^\s*(?:%|por ?ciento)/.exec(segF.slice(pos));
      if (pct) {
        out.unit = '%';
        pos += pct[0].length;
      } else {
        const perUl = /^\s*(?:\/ ?(?:µl|ul|mm3)|por (?:microlitro|milimetro cubico))/.exec(segF.slice(pos));
        if (perUl) {
          out.unit = '/µL';
          pos += perUl[0].length;
        }
        const unitWord = UNIT_WORDS.exec(segF.slice(pos));
        if (unitWord) pos += unitWord[0].length;
      }
      // Recuentos dictados como número absoluto ("plaquetas 250.000", "250 mil") → unidad del catálogo.
      if (out.unit === '×10³/µL' && value >= 1000) {
        value /= 1e3;
        out.warning = 'Dictado como recuento absoluto: se registra en ×10³/µL.';
      } else if (out.unit === '×10⁶/µL' && value >= 1e5) {
        value /= 1e6;
        out.warning = 'Dictado como recuento absoluto: se registra en ×10⁶/µL.';
      } else if (out.unit === '/µL' && def.unit === '×10³/µL') {
        value /= 1e3;
        out.unit = def.unit;
      }
      out.value = Math.round(value * 1e6) / 1e6;
    }
    const r = RANGE.exec(segF.slice(pos));
    if (r) {
      const low = Number(r[1].replace(',', '.'));
      const high = Number(r[2].replace(',', '.'));
      if (low <= high) {
        out.refLow = low;
        out.refHigh = high;
      }
      pos += r[0].length;
    }
    const note = tidy(segT.slice(pos).replace(/^[\s,;)]*(?:y|e)?\s+/i, ''));
    if (fold(note).replace(/[^a-z0-9]/g, '').length > 2) out.note = note;
    values.push(out);
  });
  return { values, unplaced };
}
