/**
 * Formato simple para los textos de indicaciones. Se guarda como texto y la barra de formato lo inserta, así
 * que nunca hace falta escribir las marcas a mano:
 * - «## Título» al inicio de una línea: subtítulo.
 * - «• texto» (o «- texto»): viñeta.
 * - «**texto**»: negrita.
 * - Dos o más líneas seguidas con «|» (la primera es el encabezado): tabla. Una sola línea con «|» es texto.
 * El PDF y la app dibujan este formato; los demás documentos lo muestran como texto sin marcas.
 */

export interface Span {
  text: string;
  bold: boolean;
}

export type RichBlock =
  | { kind: 'heading'; spans: Span[] }
  | { kind: 'bullet'; spans: Span[] }
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'table'; header: Span[][]; rows: Span[][][] }
  | { kind: 'space' };

const HEADING = /^\s*#{1,3}\s+(.*)$/;
const BULLET = /^\s*[•·*-]\s+(.*)$/;
const SEPARATOR_CELL = /^:?-{2,}:?$/;

/** Negritas («**texto**»); un «**» sin pareja queda como texto. */
export function parseInline(s: string): Span[] {
  const out: Span[] = [];
  const push = (text: string, bold: boolean) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.bold === bold) last.text += text;
    else out.push({ text, bold });
  };
  // «****» es una negrita vacía (se tocó «Negrita» sin escribir nada): no se muestra.
  s = s.replace(/\*{4}/g, '');
  const re = /\*\*(.+?)\*\*/g;
  let at = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    push(s.slice(at, m.index), false);
    push(m[1], true);
    at = m.index + m[0].length;
  }
  push(s.slice(at), false);
  return out;
}

/** Celdas de una línea de tabla («a | b | c», con o sin «|» en los extremos). */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

/** Línea de tabla: dos o más celdas, o una celda entre «|» («| Larry |»). */
const isTableLine = (line: string) => line.includes('|') && (splitRow(line).length >= 2 || /^\s*\|.*\|\s*$/.test(line));
const isSeparatorRow = (cells: string[]) => cells.every((c) => SEPARATOR_CELL.test(c));

/** Filas de una tabla (sin la línea de separación «---» de Markdown), todas con la misma cantidad de celdas. */
function tableCells(lines: string[]): string[][] {
  const rows = lines.map(splitRow).filter((cells) => !isSeparatorRow(cells));
  const cols = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array<string>(cols - r.length).fill('')]);
}

/** Grupos de líneas: tablas (dos o más líneas con «|») y líneas sueltas. */
function groupLines(text: string): Array<{ table: boolean; lines: string[]; start: number; end: number }> {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: Array<{ table: boolean; lines: string[]; start: number; end: number }> = [];
  let i = 0;
  while (i < lines.length) {
    let j = i;
    while (j < lines.length && isTableLine(lines[j])) j++;
    const rows = lines.slice(i, j).filter((l) => !isSeparatorRow(splitRow(l)));
    if (rows.length >= 2) {
      out.push({ table: true, lines: lines.slice(i, j), start: i, end: j });
      i = j;
    } else {
      out.push({ table: false, lines: [lines[i]], start: i, end: i + 1 });
      i++;
    }
  }
  return out;
}

export function parseRichText(text: string): RichBlock[] {
  const out: RichBlock[] = [];
  for (const g of groupLines(text)) {
    if (g.table) {
      const [header, ...rows] = tableCells(g.lines);
      out.push({ kind: 'table', header: header.map(parseInline), rows: rows.map((r) => r.map(parseInline)) });
      continue;
    }
    const line = g.lines[0];
    if (!line.trim()) {
      if (out.length && out[out.length - 1].kind !== 'space') out.push({ kind: 'space' });
      continue;
    }
    const h = HEADING.exec(line);
    const b = h ? null : BULLET.exec(line);
    if (h) out.push({ kind: 'heading', spans: parseInline(h[1].trim()) });
    else if (b) out.push({ kind: 'bullet', spans: parseInline(b[1].trim()) });
    else out.push({ kind: 'paragraph', spans: parseInline(line.trimEnd()) });
  }
  while (out.length && out[out.length - 1].kind === 'space') out.pop();
  return out;
}

const plainSpans = (spans: Span[]) => spans.map((s) => s.text).join('');

/** El mismo texto sin marcas de formato, para los documentos y vistas que no lo dibujan. */
export function plainRichText(text: string): string {
  return parseRichText(text)
    .map((b) => {
      if (b.kind === 'space') return '';
      if (b.kind === 'bullet') return `• ${plainSpans(b.spans)}`;
      if (b.kind === 'table') return [b.header, ...b.rows].map((r) => r.map(plainSpans).join(' | ')).join('\n');
      return plainSpans(b.spans);
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Edición con la barra de formato (funciones puras: texto y selección de entrada, texto y selección de salida)
// ---------------------------------------------------------------------------
export interface Edit {
  text: string;
  start: number;
  end: number;
}

/** Comienzo y fin de las líneas que toca la selección. */
function lineRange(text: string, start: number, end: number): [number, number] {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', Math.max(end, start) - (end > start && text[end - 1] === '\n' ? 1 : 0));
  return [from, nl === -1 ? text.length : nl];
}

/** Agrega o quita «## » (subtítulo) o «• » (viñeta) en las líneas seleccionadas. */
export function toggleLinePrefix(text: string, start: number, end: number, kind: 'heading' | 'bullet'): Edit {
  const [from, to] = lineRange(text, start, end);
  const lines = text.slice(from, to).split('\n');
  const re = kind === 'heading' ? HEADING : BULLET;
  const prefix = kind === 'heading' ? '## ' : '• ';
  const filled = lines.filter((l) => l.trim());
  const remove = filled.length > 0 && filled.every((l) => re.test(l));
  const next = lines.map((l) => {
    if (remove) return l.replace(kind === 'heading' ? /^\s*#{1,3}\s+/ : /^\s*[•·*-]\s+/, '');
    if (!l.trim() && lines.length > 1) return l;
    // Una viñeta pasa a subtítulo (y al revés) sin acumular marcas.
    return prefix + l.replace(/^\s*(#{1,3}|[•·*-])\s+/, '').trimStart();
  });
  const block = next.join('\n');
  const out = text.slice(0, from) + block + text.slice(to);
  const caret = from + block.length;
  return lines.length === 1 ? { text: out, start: caret, end: caret } : { text: out, start: from, end: caret };
}

/** Pone o quita la negrita de la selección; sin selección, deja el cursor entre «**» y «**». */
export function toggleBold(text: string, start: number, end: number): Edit {
  if (start === end) return { text: `${text.slice(0, start)}****${text.slice(end)}`, start: start + 2, end: start + 2 };
  const sel = text.slice(start, end);
  if (sel.startsWith('**') && sel.endsWith('**') && sel.length >= 4) {
    const inner = sel.slice(2, -2);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  if (text.slice(start - 2, start) === '**' && text.slice(end, end + 2) === '**') {
    return { text: text.slice(0, start - 2) + sel + text.slice(end + 2), start: start - 2, end: end - 2 };
  }
  // Los espacios de los extremos quedan fuera de la negrita («** texto**» no se reconocería).
  const lead = sel.length - sel.trimStart().length;
  const trail = sel.length - sel.trimEnd().length;
  const core = sel.trim();
  if (!core) return { text, start, end };
  const s = start + lead;
  const e = end - trail;
  return { text: `${text.slice(0, s)}**${core}**${text.slice(e)}`, start: s + 2, end: e + 2 };
}

/** Tabla en la que está el cursor: su rango en el texto y sus celdas (sin marcas de separación). */
export function tableAt(text: string, pos: number): { start: number; end: number; cells: string[][] } | null {
  const norm = text.replace(/\r\n?/g, '\n');
  const lines = norm.split('\n');
  const lineOf = norm.slice(0, pos).split('\n').length - 1;
  const g = groupLines(norm).find((x) => x.table && lineOf >= x.start && lineOf < x.end);
  if (!g) return null;
  const offset = (line: number) => lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
  return { start: offset(g.start), end: offset(g.end - 1) + lines[g.end - 1].length, cells: tableCells(g.lines) };
}

/** Celdas → líneas de tabla (una celda no puede contener «|» ni saltos de línea). */
export function tableText(cells: string[][]): string {
  return cells.map((r) => r.map((c) => c.replace(/\s*[|\n\r]+\s*/g, ' ').trim()).join(' | ')).join('\n');
}

/** Inserta un bloque en líneas propias en la posición del cursor (o reemplaza el rango indicado). */
export function insertBlock(text: string, start: number, end: number, block: string): Edit {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before && !before.endsWith('\n') ? '\n' : '';
  const trail = after && !after.startsWith('\n') ? '\n' : '';
  const out = before + lead + block + trail + after;
  const caret = before.length + lead.length + block.length;
  return { text: out, start: caret, end: caret };
}
