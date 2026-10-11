/** CSV compatible con Excel en español (separador ';', BOM UTF-8 y comillas cuando corresponde). */
export function toCSV(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>, sep = ';'): string {
  const esc = (v: string | number | boolean | null | undefined) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    // Evita inyección de fórmulas al abrir el archivo en planillas.
    if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
    return /["\n\r;,]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(sep), ...rows.map((r) => r.map(esc).join(sep))];
  return `﻿${lines.join('\r\n')}\r\n`;
}
