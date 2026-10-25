import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { Profile } from '@/data/schema';
import { DEFAULT_APP_NAME } from '@/lib/platform';
import { parseRichText, type Span } from '@/lib/richText';

/**
 * Motor de maquetación simple sobre pdf-lib (fuentes estándar, sin dependencias de red).
 * Todo el texto pasa por `sanitize` para usar solo caracteres compatibles con la codificación WinAnsi
 * (cubre el español completo: tildes, ñ, ü, ¿, ¡, °, µ).
 */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const REPLACE: Record<string, string> = {
  '≥': '>=',
  '≤': '<=',
  '≈': '~',
  '→': '->',
  '←': '<-',
  '✓': 'v',
  '✔': 'v',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '\t': '    ',
  '′': "'",
  '″': '"',
};

export function sanitize(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const code = ch.codePointAt(0)!;
    if (ch === '\n') out += '\n';
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.includes(ch)) out += ch;
    else if (REPLACE[ch] !== undefined) out += REPLACE[ch];
    else if (code < 0x20) out += ' ';
    else out += '?';
  }
  return out;
}

const INK = rgb(0.106, 0.145, 0.141);
const MUTED = rgb(0.41, 0.45, 0.44);
const BRAND = rgb(0.122, 0.373, 0.341);
const LINE = rgb(0.85, 0.82, 0.78);
const WHITE = rgb(1, 1, 1);
const ROW_SHADE = rgb(0.925, 0.953, 0.949);
const TABLE_LINE = rgb(0.76, 0.82, 0.81);

/** Trozo de texto con su fuente; una palabra puede mezclar negrita y texto normal («**Canigest**(probiótico)»). */
interface Piece {
  text: string;
  font: PDFFont;
  w: number;
}
interface Word {
  pieces: Piece[];
  w: number;
}
interface LaidLine {
  words: Word[];
  w: number;
}

export interface WriterOpts {
  paper: 'letter' | 'a4';
  title: string;
  docTitle: string;
  docSubtitle?: string;
  profile?: Profile;
  logo?: Uint8Array;
  footerNote?: string;
  watermark?: string;
}

export class PdfWriter {
  doc!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  italic!: PDFFont;
  logo?: PDFImage;
  margin = 50;
  y = 0;
  width = 0;
  height = 0;
  opts!: WriterOpts;

  static async create(opts: WriterOpts): Promise<PdfWriter> {
    const w = new PdfWriter();
    w.opts = opts;
    w.doc = await PDFDocument.create();
    w.doc.setTitle(sanitize(opts.title));
    w.doc.setCreator(sanitize(opts.profile?.appName || DEFAULT_APP_NAME));
    w.doc.setProducer(`${sanitize(opts.profile?.appName || DEFAULT_APP_NAME)} (pdf-lib)`);
    if (opts.profile?.fullName) w.doc.setAuthor(sanitize(opts.profile.fullName));
    w.doc.setLanguage('es-CL');
    w.font = await w.doc.embedFont(StandardFonts.Helvetica);
    w.bold = await w.doc.embedFont(StandardFonts.HelveticaBold);
    w.italic = await w.doc.embedFont(StandardFonts.HelveticaOblique);
    if (opts.logo) {
      try {
        w.logo = await w.doc.embedJpg(opts.logo);
      } catch {
        w.logo = undefined;
      }
    }
    w.newPage(true);
    return w;
  }

  get contentWidth() {
    return this.width - this.margin * 2;
  }

  newPage(first = false) {
    const [pw, ph] = this.opts.paper === 'a4' ? [595.28, 841.89] : [612, 792];
    this.page = this.doc.addPage([pw, ph]);
    this.width = pw;
    this.height = ph;
    this.y = ph - this.margin;
    if (this.opts.watermark) {
      this.page.drawText(sanitize(this.opts.watermark), {
        x: pw / 2 - 170,
        y: ph / 2 - 60,
        size: 64,
        font: this.bold,
        color: rgb(0.85, 0.3, 0.25),
        opacity: 0.12,
        rotate: degrees(35),
      });
    }
    if (first) this.header();
    else this.compactHeader();
  }

  private header() {
    const p = this.opts.profile;
    const top = this.y;
    let textX = this.margin;
    if (this.logo) {
      const h = 46;
      const w = (this.logo.width / this.logo.height) * h;
      this.page.drawImage(this.logo, { x: this.width - this.margin - Math.min(w, 140), y: top - h + 6, width: Math.min(w, 140), height: h });
    }
    if (p) {
      this.text(p.fullName || 'Profesional', { x: textX, size: 13, font: this.bold, color: BRAND });
      const lines = [
        p.title,
        [p.rut && `RUT ${p.rut}`, p.licenseNumber && `Registro/colegiatura: ${p.licenseNumber}`].filter(Boolean).join(' · '),
        [p.phone, p.email].filter(Boolean).join(' · '),
        [p.address, p.comuna, p.city].filter(Boolean).join(', '),
        p.serviceArea && `Atención a domicilio: ${p.serviceArea}`,
      ].filter(Boolean) as string[];
      for (const l of lines) this.text(l, { x: textX, size: 9, color: MUTED, maxWidth: this.contentWidth - 150 });
    }
    textX = this.margin;
    this.y -= 6;
    this.rule(BRAND, 1.2);
    this.y -= 14;
    this.text(this.opts.docTitle, { size: 16, font: this.bold });
    if (this.opts.docSubtitle) this.text(this.opts.docSubtitle, { size: 9.5, color: MUTED });
    this.y -= 6;
  }

  private compactHeader() {
    this.text(`${this.opts.docTitle}${this.opts.profile?.fullName ? ` · ${this.opts.profile.fullName}` : ''}`, { size: 8.5, color: MUTED });
    this.rule(LINE, 0.6);
    this.y -= 10;
  }

  ensure(h: number) {
    if (this.y - h < this.margin + 34) this.newPage();
  }

  rule(color = LINE, thickness = 0.6) {
    this.page.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.width - this.margin, y: this.y }, thickness, color });
    this.y -= 2;
  }

  /** Divide texto en líneas que caben en `maxWidth`. */
  wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const out: string[] = [];
    for (const para of sanitize(text).split('\n')) {
      const words = para.split(/ +/);
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) out.push(line);
        if (font.widthOfTextAtSize(word, size) <= maxWidth) {
          line = word;
        } else {
          // Palabra más larga que la línea: se corta por caracteres.
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              out.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
        }
      }
      out.push(line);
    }
    return out;
  }

  text(t: string, o: { x?: number; size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number; lineGap?: number } = {}) {
    const size = o.size ?? 10.5;
    const font = o.font ?? this.font;
    const x = o.x ?? this.margin;
    const maxWidth = o.maxWidth ?? this.width - this.margin - x;
    const lh = size * (1.32 + (o.lineGap ?? 0));
    for (const line of this.wrap(t, font, size, maxWidth)) {
      this.ensure(lh);
      this.page.drawText(line, { x, y: this.y - size, size, font, color: o.color ?? INK });
      this.y -= lh;
    }
  }

  heading(t: string) {
    this.ensure(34);
    this.y -= 8;
    this.text(t.toUpperCase(), { size: 9.5, font: this.bold, color: BRAND });
    this.y -= 2;
  }

  spacer(h = 8) {
    this.y -= h;
  }

  /** Pares etiqueta / valor en dos columnas. */
  keyValues(rows: Array<[string, string | undefined | null]>, labelWidth = 150, size = 10) {
    for (const [label, value] of rows) {
      if (value === undefined || value === null || String(value).trim() === '') continue;
      const lines = this.wrap(String(value), this.font, size, this.contentWidth - labelWidth);
      const lh = size * 1.32;
      this.ensure(lh * Math.min(lines.length, 3));
      const startY = this.y;
      this.page.drawText(sanitize(label), { x: this.margin, y: this.y - size, size: size - 0.5, font: this.bold, color: MUTED });
      for (const l of lines) {
        this.ensure(lh);
        this.page.drawText(l, { x: this.margin + labelWidth, y: this.y - size, size, font: this.font, color: INK });
        this.y -= lh;
      }
      if (this.y === startY) this.y -= lh;
      this.y -= 1.5;
    }
  }

  /** Recuadro de aviso (normativo o informativo). */
  box(t: string, tone: 'info' | 'warning' | 'danger' = 'info', size = 9) {
    const pad = 8;
    const lines = this.wrap(t, this.font, size, this.contentWidth - pad * 2);
    const lh = size * 1.32;
    const h = lines.length * lh + pad * 2;
    this.ensure(h + 6);
    const colors = {
      info: { bg: rgb(0.94, 0.97, 0.99), border: rgb(0.62, 0.78, 0.9) },
      warning: { bg: rgb(1, 0.97, 0.9), border: rgb(0.93, 0.76, 0.4) },
      danger: { bg: rgb(1, 0.94, 0.93), border: rgb(0.92, 0.55, 0.5) },
    }[tone];
    this.page.drawRectangle({ x: this.margin, y: this.y - h, width: this.contentWidth, height: h, color: colors.bg, borderColor: colors.border, borderWidth: 0.8 });
    let yy = this.y - pad;
    for (const l of lines) {
      this.page.drawText(l, { x: this.margin + pad, y: yy - size, size, font: this.font, color: INK });
      yy -= lh;
    }
    this.y -= h + 6;
  }

  /** Tabla simple con anchos relativos; las celdas se ajustan en varias líneas. */
  table(columns: Array<{ title: string; width: number; align?: 'left' | 'right' }>, rows: string[][], size = 9) {
    const total = columns.reduce((s, c) => s + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * this.contentWidth);
    const lh = size * 1.3;
    const drawRow = (cells: string[], font: PDFFont, shade?: boolean) => {
      const wrapped = cells.map((cell, i) => this.wrap(cell ?? '', font, size, widths[i] - 6));
      const h = Math.max(...wrapped.map((w) => w.length)) * lh + 6;
      this.ensure(h);
      if (shade) this.page.drawRectangle({ x: this.margin, y: this.y - h, width: this.contentWidth, height: h, color: rgb(0.96, 0.95, 0.93) });
      let x = this.margin;
      wrapped.forEach((lines, i) => {
        let yy = this.y - 3;
        for (const l of lines) {
          const tw = font.widthOfTextAtSize(l, size);
          const tx = columns[i].align === 'right' ? x + widths[i] - 3 - tw : x + 3;
          this.page.drawText(l, { x: tx, y: yy - size, size, font, color: INK });
          yy -= lh;
        }
        x += widths[i];
      });
      this.y -= h;
      this.page.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.width - this.margin, y: this.y }, thickness: 0.4, color: LINE });
    };
    drawRow(
      columns.map((c) => c.title),
      this.bold,
      true,
    );
    for (const r of rows) drawRow(r, this.font);
    this.y -= 4;
  }

  /** Texto con formato simple: subtítulos, viñetas, negritas y tablas (ver `lib/richText`). */
  rich(t: string, size = 10.5) {
    for (const b of parseRichText(t)) {
      if (b.kind === 'space') this.y -= size * 0.6;
      else if (b.kind === 'heading') {
        this.ensure(size * 5);
        this.y -= 7;
        this.paragraph(b.spans, { size: size + 2, bold: true, color: BRAND });
        this.y += 1;
        this.rule(BRAND, 0.7);
        this.y -= 5;
      } else if (b.kind === 'bullet') {
        this.y -= 1.5;
        this.paragraph(b.spans, { x: this.margin + 16, size, bullet: true });
      } else if (b.kind === 'paragraph') this.paragraph(b.spans, { size });
      else this.richTable(b.header, b.rows, size - 1);
    }
  }

  /** Tabla centrada con encabezado de color y filas alternadas; el encabezado se repite si cambia de página. */
  richTable(header: Span[][], rows: Span[][][], size = 9.5) {
    const pad = 7;
    const lh = size * 1.3;
    const space = this.font.widthOfTextAtSize(' ', size);
    const widthOf = (spans: Span[], bold: boolean) => this.words(spans, size, bold).reduce((s, w, i) => s + w.w + (i ? space : 0), 0);
    const longest = (spans: Span[], bold: boolean) => Math.max(0, ...this.words(spans, size, bold).map((w) => w.w));
    const column = (i: number, f: (s: Span[], bold: boolean) => number) => Math.max(36, f(header[i], true), ...rows.map((r) => f(r[i] ?? [], false))) + pad * 2;
    // Ancho para que cada celda quepa en una línea y mínimo para no cortar palabras.
    const natural = header.map((_, i) => column(i, widthOf));
    const minimum = header.map((_, i) => column(i, longest));
    const sum = natural.reduce((a, b) => a + b, 0);
    const minSum = minimum.reduce((a, b) => a + b, 0);
    const target = Math.min(this.contentWidth, Math.max(sum * 1.3, this.contentWidth * 0.55));
    let widths: number[];
    if (sum <= target) widths = natural.map((w) => (w / sum) * target);
    else if (minSum >= target) widths = minimum.map((w) => (w / minSum) * target);
    else {
      const flex = natural.map((w, i) => w - minimum[i]);
      const flexSum = flex.reduce((a, b) => a + b, 0) || 1;
      widths = minimum.map((w, i) => w + ((target - minSum) * flex[i]) / flexSum);
    }
    const x0 = this.margin + (this.contentWidth - target) / 2;
    const drawRow = (cells: Span[][], head: boolean, shade: boolean) => {
      const laid = widths.map((w, i) => this.layout(cells[i] ?? [], size, w - pad * 2, head));
      const h = Math.max(...laid.map((l) => l.length)) * lh + 8;
      if (this.y - h < this.margin + 34) {
        this.newPage();
        if (!head) drawRow(header, true, false);
      }
      let x = x0;
      laid.forEach((lines, i) => {
        this.page.drawRectangle({ x, y: this.y - h, width: widths[i], height: h, color: head ? BRAND : shade ? ROW_SHADE : WHITE, borderColor: TABLE_LINE, borderWidth: 0.6 });
        let top = this.y - 4 - (h - 8 - lines.length * lh) / 2;
        for (const line of lines) {
          this.drawWords(line, x + (widths[i] - line.w) / 2, top - size, size, head ? WHITE : INK);
          top -= lh;
        }
        x += widths[i];
      });
      this.y -= h;
    };
    this.ensure(lh * 3 + 24);
    this.y -= 4;
    drawRow(header, true, false);
    rows.forEach((r, k) => drawRow(r, false, k % 2 === 1));
    this.y -= 8;
  }

  /** Tabla de datos con el mismo estilo (por ejemplo, pacientes y pesos). */
  dataTable(header: string[], rows: string[][], size = 9.5) {
    const cell = (s: string): Span[] => [{ text: s, bold: false }];
    this.richTable(header.map(cell), rows.map((r) => r.map(cell)), size);
  }

  /** Párrafo con negritas (o viñeta, con la viñeta a la izquierda de `x`). */
  private paragraph(spans: Span[], o: { x?: number; size: number; bold?: boolean; color?: ReturnType<typeof rgb>; bullet?: boolean }) {
    const x = o.x ?? this.margin;
    const lh = o.size * 1.32;
    this.layout(spans, o.size, this.width - this.margin - x, o.bold).forEach((line, i) => {
      this.ensure(lh);
      if (o.bullet && i === 0) this.page.drawText('•', { x: x - 11, y: this.y - o.size, size: o.size, font: this.font, color: o.color ?? INK });
      this.drawWords(line, x, this.y - o.size, o.size, o.color ?? INK);
      this.y -= lh;
    });
  }

  /** Palabras de un texto con negritas, medidas con su fuente. */
  private words(spans: Span[], size: number, bold = false): Word[] {
    const out: Word[] = [];
    // Un trozo pegado al anterior (sin espacio) continúa la misma palabra.
    let joined = false;
    for (const span of spans) {
      const font = bold || span.bold ? this.bold : this.font;
      for (const token of sanitize(span.text).split(/( +)/)) {
        if (!token) continue;
        if (!token.trim()) {
          joined = false;
          continue;
        }
        const piece = { text: token, font, w: font.widthOfTextAtSize(token, size) };
        const last = out[out.length - 1];
        if (joined && last) {
          last.pieces.push(piece);
          last.w += piece.w;
        } else out.push({ pieces: [piece], w: piece.w });
        joined = true;
      }
    }
    return out;
  }

  /** Reparte las palabras en líneas de `maxWidth` como máximo (una palabra más larga que la línea se corta). */
  private layout(spans: Span[], size: number, maxWidth: number, bold = false): LaidLine[] {
    const space = this.font.widthOfTextAtSize(' ', size);
    const lines: LaidLine[] = [];
    let line: LaidLine = { words: [], w: 0 };
    const push = (word: Word) => {
      if (line.words.length && line.w + space + word.w > maxWidth) {
        lines.push(line);
        line = { words: [], w: 0 };
      }
      line.w += (line.words.length ? space : 0) + word.w;
      line.words.push(word);
    };
    for (const word of this.words(spans, size, bold)) {
      if (word.w <= maxWidth) push(word);
      else for (const part of this.splitWord(word, size, maxWidth)) push(part);
    }
    if (line.words.length || !lines.length) lines.push(line);
    return lines;
  }

  private splitWord(word: Word, size: number, maxWidth: number): Word[] {
    const parts: Word[] = [];
    let cur: Word = { pieces: [], w: 0 };
    for (const p of word.pieces) {
      for (const ch of p.text) {
        const cw = p.font.widthOfTextAtSize(ch, size);
        if (cur.w > 0 && cur.w + cw > maxWidth) {
          parts.push(cur);
          cur = { pieces: [], w: 0 };
        }
        const last = cur.pieces[cur.pieces.length - 1];
        if (last && last.font === p.font) {
          last.text += ch;
          last.w += cw;
        } else cur.pieces.push({ text: ch, font: p.font, w: cw });
        cur.w += cw;
      }
    }
    if (cur.pieces.length) parts.push(cur);
    return parts;
  }

  private drawWords(line: LaidLine, x: number, y: number, size: number, color: ReturnType<typeof rgb>) {
    const space = this.font.widthOfTextAtSize(' ', size);
    let cx = x;
    line.words.forEach((word, i) => {
      if (i) cx += space;
      for (const p of word.pieces) {
        this.page.drawText(p.text, { x: cx, y, size, font: p.font, color });
        cx += p.w;
      }
    });
  }

  async signature(o: { image?: Uint8Array; name?: string; lines?: string[]; caption?: string; x?: number; width?: number }) {
    const width = o.width ?? 220;
    const x = o.x ?? this.width - this.margin - width;
    this.ensure(110);
    this.y -= 10;
    if (o.image) {
      try {
        const img = await this.doc.embedJpg(o.image);
        const h = 54;
        const w = Math.min((img.width / img.height) * h, width);
        this.page.drawImage(img, { x: x + (width - w) / 2, y: this.y - h, width: w, height: h });
      } catch {
        /* imagen no compatible: se omite */
      }
    }
    this.y -= 58;
    this.page.drawLine({ start: { x, y: this.y }, end: { x: x + width, y: this.y }, thickness: 0.8, color: INK });
    this.y -= 2;
    if (o.name) this.text(o.name, { x, size: 9.5, font: this.bold, maxWidth: width });
    for (const l of o.lines ?? []) this.text(l, { x, size: 8.5, color: MUTED, maxWidth: width });
    if (o.caption) this.text(o.caption, { x, size: 7.5, font: this.italic, color: MUTED, maxWidth: width });
  }

  async finish(): Promise<Blob> {
    const pages = this.doc.getPages();
    const note = this.opts.footerNote ? sanitize(this.opts.footerNote) : '';
    pages.forEach((p, i) => {
      const label = `Página ${i + 1} de ${pages.length}`;
      p.drawText(label, { x: this.width - this.margin - this.font.widthOfTextAtSize(label, 7.5), y: 26, size: 7.5, font: this.font, color: MUTED });
      if (note) {
        const lines = this.wrap(note, this.font, 7, this.contentWidth - 80);
        lines.slice(0, 3).forEach((l, k) => p.drawText(l, { x: this.margin, y: 34 - k * 8.5, size: 7, font: this.font, color: MUTED }));
      }
    });
    const bytes = await this.doc.save();
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
  }
}
