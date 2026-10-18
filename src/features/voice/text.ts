/**
 * Utilidades para interpretar texto dictado en español (todo ocurre en el teléfono).
 * El texto se "pliega" (minúsculas y sin tildes) conservando el largo, para buscar palabras clave
 * y luego recortar el texto original en las mismas posiciones.
 */

/** Minúsculas y sin tildes, con exactamente el mismo largo que el original. */
export function fold(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const base = ch.normalize('NFD')[0] ?? ch;
    const low = base.toLowerCase();
    out += low.length === 1 ? low : ch;
  }
  return out;
}

const SMALL: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS: Record<string, number> = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500 };

export interface FoundNumber {
  value: number;
  /** Posición y largo en el texto (sirven para el texto plegado y el original). */
  index: number;
  length: number;
}

/** Primer número del texto, escrito con cifras ("12,4", "38.5", "38 y medio") o con palabras ("treinta y ocho coma cinco"). */
export function findNumber(folded: string): FoundNumber | null {
  const digits = /(\d+(?:[.,]\d+)?)(\s+y\s+medio)?/.exec(folded);
  const words = findWordNumber(folded);
  const d = digits
    ? {
        value: Number(digits[1].replace(',', '.')) + (digits[2] ? 0.5 : 0),
        index: digits.index,
        length: digits[0].length,
      }
    : null;
  if (d && (!words || d.index <= words.index)) return d;
  return words;
}

function findWordNumber(folded: string): FoundNumber | null {
  const re = /[a-z]+/g;
  const tokens: Array<{ w: string; start: number; end: number }> = [];
  for (let m = re.exec(folded); m; m = re.exec(folded)) tokens.push({ w: m[0], start: m.index, end: m.index + m[0].length });
  const isNum = (w: string) => w in SMALL || w in TENS || w in HUNDREDS;
  for (let i = 0; i < tokens.length; i++) {
    if (!isNum(tokens[i].w)) continue;
    // "un"/"una" solos son artículos, no números (salvo "una semana", que se resuelve en quien lo usa).
    if ((tokens[i].w === 'un' || tokens[i].w === 'una') && !(i + 1 < tokens.length && /^(y|coma|punto)$/.test(tokens[i + 1].w))) continue;
    let j = i;
    let value = 0;
    if (tokens[j].w in HUNDREDS) {
      value += HUNDREDS[tokens[j].w];
      j++;
    }
    if (j < tokens.length && tokens[j].w in TENS) {
      value += TENS[tokens[j].w];
      j++;
      if (j + 1 < tokens.length && tokens[j].w === 'y' && tokens[j + 1].w in SMALL && SMALL[tokens[j + 1].w] < 10) {
        value += SMALL[tokens[j + 1].w];
        j += 2;
      }
    } else if (j < tokens.length && tokens[j].w in SMALL) {
      value += SMALL[tokens[j].w];
      j++;
    }
    let end = tokens[j - 1].end;
    // Parte decimal: "coma cinco", "punto dos cinco", "y medio".
    if (j + 1 < tokens.length && (tokens[j].w === 'coma' || tokens[j].w === 'punto')) {
      let k = j + 1;
      let dec = '';
      while (k < tokens.length && tokens[k].w in SMALL && SMALL[tokens[k].w] <= 99) {
        dec += String(SMALL[tokens[k].w]);
        end = tokens[k].end;
        k++;
      }
      if (dec) value = Number(`${value}.${dec}`);
    } else if (j + 1 < tokens.length && tokens[j].w === 'y' && tokens[j + 1].w === 'medio') {
      value += 0.5;
      end = tokens[j + 1].end;
    }
    return { value, index: tokens[i].start, length: end - tokens[i].start };
  }
  return null;
}

/** Primera letra en mayúscula, sin puntuación ni "y" sobrantes al inicio o al final ("dieta renal y" → "Dieta renal"). */
export function tidy(s: string): string {
  let t = s.replace(/\s+/g, ' ').replace(/^[\s,.;:–—-]+/, '');
  for (let prev = ''; prev !== t; ) {
    prev = t;
    t = t.replace(/[\s,;:–—-]+$/, '').replace(/\.+$/, '').replace(/\s(?:y|e|o|u)$/i, '');
  }
  return t ? t.charAt(0).toLocaleUpperCase('es-CL') + t.slice(1) : '';
}

export interface MarkerDef<K extends string> {
  key: K;
  /** Expresión sobre el texto plegado (sin tildes, en minúsculas). */
  re: string;
  /**
   * true: se reconoce solo al comenzar una frase (al inicio, después de punto, coma, punto y coma o salto de línea),
   * o si va seguida de dos puntos o de "normal"/"sin alteraciones". Evita cortar frases como "dolor de abdomen"
   * dentro del motivo.
   */
  weak?: boolean;
  /** Condición sobre lo que sigue a la palabra clave (texto plegado), p. ej. que venga un número. */
  accept?: (after: string) => boolean;
  /** La palabra clave es parte del dato (p. ej. «Soplo grado 3»). */
  keepMarker?: boolean;
  /** Sección a la que pertenece el dato (da contexto a las palabras clave débiles que siguen). */
  section?: string;
  /**
   * Palabra clave débil aceptada también a mitad de frase (dictado sin puntuación) cuando la palabra clave anterior es
   * de una de estas secciones y, si se indica, lo que sigue calza con `follow`.
   */
  context?: { sections: string[]; follow?: RegExp };
}

export interface Segment<K extends string> {
  key: K;
  /** Texto de la palabra clave tal como se dictó (plegado). */
  marker: string;
  /** Texto que sigue a la palabra clave hasta la siguiente (original y plegado). */
  text: string;
  folded: string;
  /** Frase completa (palabra clave + texto), para mostrar de dónde salió cada dato. */
  source: string;
}

const BOUNDARY = /(^|[.,;:\n!?¿¡])\s*(?:(?:y|el|la|los|las|en|al)\s+)*$/;
const AFTER_OK = /^\s*(?::|(?:normal|normales|sin alteraciones|sin hallazgos|sin particularidades|s\/a)(?![a-z]))/;

/**
 * Divide el texto en tramos que comienzan en una palabra clave.
 * `lead` es lo dictado antes de la primera palabra clave.
 */
export function segment<K extends string>(text: string, defs: MarkerDef<K>[]): { segments: Segment<K>[]; lead: string } {
  const folded = fold(text);
  const found: Array<{ start: number; end: number; def: MarkerDef<K>; ok: boolean }> = [];
  for (const def of defs) {
    const re = new RegExp(`\\b(?:${def.re})(?![a-z0-9])`, 'g');
    for (let m = re.exec(folded); m; m = re.exec(folded)) {
      const start = m.index;
      const end = start + m[0].length;
      const after = folded.slice(end);
      if (def.accept && !def.accept(after)) continue;
      const ok = !def.weak || BOUNDARY.test(folded.slice(0, start)) || AFTER_OK.test(after);
      if (!ok && !def.context) continue;
      found.push({ start, end, def, ok });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const chosen: typeof found = [];
  for (const f of found) {
    const last = chosen[chosen.length - 1];
    if (last && f.start < last.end) continue;
    if (!f.ok) {
      const ctx = f.def.context!;
      if (!last || !ctx.sections.includes(last.def.section ?? '') || (ctx.follow && !ctx.follow.test(folded.slice(f.end)))) continue;
    }
    chosen.push(f);
  }
  const segments = chosen.map((c, i) => {
    const end = chosen[i + 1]?.start ?? text.length;
    const from = c.def.keepMarker ? c.start : c.end;
    return {
      key: c.def.key,
      marker: folded.slice(c.start, c.end),
      text: text.slice(from, end),
      folded: folded.slice(from, end),
      source: tidy(text.slice(c.start, end)),
    };
  });
  return { segments, lead: tidy(text.slice(0, chosen[0]?.start ?? text.length)) };
}

/** Divide en frases (punto, punto y coma o salto de línea), sin cortar decimales como "1.5". */
export function sentences(text: string): string[] {
  return text
    .split(/;|\n|\.(?!\d)/)
    .map(tidy)
    .filter(Boolean);
}
