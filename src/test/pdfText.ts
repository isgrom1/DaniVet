import { unzlibSync } from 'fflate';

const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž',
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

/** Extrae el texto de un PDF generado con pdf-lib (fuentes estándar): descomprime los flujos y decodifica los textos hex. */
export function extractPdfText(bytes: Uint8Array): string {
  const latin = new TextDecoder('latin1').decode(bytes);
  const out: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin))) {
    const start = m.index + m[0].length;
    const end = latin.indexOf('endstream', start);
    if (end < 0) break;
    const raw = bytes.subarray(start, end);
    let content: string;
    try {
      content = new TextDecoder('latin1').decode(unzlibSync(raw));
    } catch {
      content = new TextDecoder('latin1').decode(raw);
    }
    for (const t of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      const hex = t[1];
      let s = '';
      for (let i = 0; i < hex.length; i += 2) {
        const c = parseInt(hex.slice(i, i + 2), 16);
        s += WIN_ANSI_HIGH[c] ?? String.fromCharCode(c);
      }
      out.push(s);
    }
    re.lastIndex = end;
  }
  return out.join('\n');
}
