import { describe, expect, it } from 'vitest';
import { insertBlock, parseInline, parseRichText, plainRichText, tableAt, tableText, toggleBold, toggleLinePrefix } from './richText';

const INDICACIONES = [
  '## 1. Tratamiento de diarrea líquida',
  '• Cambio de alimento a **Royal Canin Gastrointestinal Kitten** durante **21 días**.',
  '• Realizar la transición de alimento en 4 días:',
  'Día | Alimento antiguo | Alimento nuevo',
  'Día 1 | 3/4 | 1/4',
  'Día 2 | 1/2 | 1/2',
  '',
  '- Ofrecer **AL DÍA 50 gramos** de pellet.',
  'Texto normal con una sola línea | que no es tabla.',
].join('\n');

describe('formato simple de las indicaciones', () => {
  it('reconoce subtítulos, viñetas, negritas, tablas y texto normal', () => {
    const blocks = parseRichText(INDICACIONES);
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'bullet', 'bullet', 'table', 'space', 'bullet', 'paragraph']);
    expect(blocks[0]).toEqual({ kind: 'heading', spans: [{ text: '1. Tratamiento de diarrea líquida', bold: false }] });
    expect(blocks[1]).toEqual({
      kind: 'bullet',
      spans: [
        { text: 'Cambio de alimento a ', bold: false },
        { text: 'Royal Canin Gastrointestinal Kitten', bold: true },
        { text: ' durante ', bold: false },
        { text: '21 días', bold: true },
        { text: '.', bold: false },
      ],
    });
    const table = blocks[3];
    expect(table.kind === 'table' && table.header.map((c) => c[0].text)).toEqual(['Día', 'Alimento antiguo', 'Alimento nuevo']);
    expect(table.kind === 'table' && table.rows.map((r) => r.map((c) => c[0]?.text ?? ''))).toEqual([
      ['Día 1', '3/4', '1/4'],
      ['Día 2', '1/2', '1/2'],
    ]);
    // «- texto» también es viñeta; una sola línea con «|» queda como texto.
    expect(blocks[5].kind === 'bullet' && blocks[5].spans[1]).toEqual({ text: 'AL DÍA 50 gramos', bold: true });
    expect(blocks[6]).toEqual({ kind: 'paragraph', spans: [{ text: 'Texto normal con una sola línea | que no es tabla.', bold: false }] });
  });

  it('acepta tablas con «|» en los extremos y la línea «---», y completa filas cortas', () => {
    const blocks = parseRichText('| Paciente | Peso |\n|---|---|\n| Pipu | 1,21 kg |\n| Larry |');
    expect(blocks).toHaveLength(1);
    const t = blocks[0];
    expect(t.kind).toBe('table');
    if (t.kind !== 'table') return;
    expect(t.header.map((c) => c[0].text)).toEqual(['Paciente', 'Peso']);
    expect(t.rows.map((r) => r.map((c) => c[0]?.text ?? ''))).toEqual([
      ['Pipu', '1,21 kg'],
      ['Larry', ''],
    ]);
  });

  it('una negrita sin cerrar o vacía no deja marcas extrañas', () => {
    expect(parseInline('Dosis **2 ml')).toEqual([{ text: 'Dosis **2 ml', bold: false }]);
    expect(parseInline('Antes****después')).toEqual([{ text: 'Antesdespués', bold: false }]);
    expect(parseRichText('**Opciones de productos:**')).toEqual([{ kind: 'paragraph', spans: [{ text: 'Opciones de productos:', bold: true }] }]);
  });

  it('quita las marcas para los documentos que no dibujan el formato', () => {
    expect(plainRichText(INDICACIONES)).toBe(
      [
        '1. Tratamiento de diarrea líquida',
        '• Cambio de alimento a Royal Canin Gastrointestinal Kitten durante 21 días.',
        '• Realizar la transición de alimento en 4 días:',
        'Día | Alimento antiguo | Alimento nuevo',
        'Día 1 | 3/4 | 1/4',
        'Día 2 | 1/2 | 1/2',
        '',
        '• Ofrecer AL DÍA 50 gramos de pellet.',
        'Texto normal con una sola línea | que no es tabla.',
      ].join('\n'),
    );
    expect(plainRichText('Texto sin formato\nen dos líneas')).toBe('Texto sin formato\nen dos líneas');
  });
});

describe('barra de formato', () => {
  it('agrega y quita subtítulos y viñetas en las líneas seleccionadas', () => {
    const text = 'Vacunación\nTriple felina\nAntirrábica';
    const h = toggleLinePrefix(text, 3, 3, 'heading');
    expect(h.text).toBe('## Vacunación\nTriple felina\nAntirrábica');
    expect(h.start).toBe('## Vacunación'.length);
    expect(toggleLinePrefix(h.text, 4, 4, 'heading').text).toBe(text);
    // Varias líneas: todas pasan a viñeta, y de nuevo vuelven a texto.
    const from = text.indexOf('Triple');
    const b = toggleLinePrefix(text, from, text.length, 'bullet');
    expect(b.text).toBe('Vacunación\n• Triple felina\n• Antirrábica');
    expect(toggleLinePrefix(b.text, b.start, b.end, 'bullet').text).toBe(text);
    // Una viñeta pasa a subtítulo sin acumular marcas.
    expect(toggleLinePrefix('• Vacunación', 0, 0, 'heading').text).toBe('## Vacunación');
    // En una línea vacía deja la marca lista para escribir.
    expect(toggleLinePrefix('Texto\n', 6, 6, 'bullet')).toEqual({ text: 'Texto\n• ', start: 8, end: 8 });
  });

  it('pone y quita negritas sin incluir los espacios de los extremos', () => {
    const text = 'Ofrecer al día 50 gramos de pellet';
    const s = text.indexOf('al día');
    const e = text.indexOf(' de pellet');
    const b = toggleBold(text, s - 1, e + 1);
    expect(b.text).toBe('Ofrecer **al día 50 gramos** de pellet');
    expect(b.text.slice(b.start, b.end)).toBe('al día 50 gramos');
    expect(toggleBold(b.text, b.start, b.end).text).toBe(text);
    expect(toggleBold('ab', 1, 1)).toEqual({ text: 'a****b', start: 3, end: 3 });
  });

  it('edita la tabla en la que está el cursor y agrega tablas en líneas propias', () => {
    const text = 'Transición:\nDía | Antiguo | Nuevo\nDía 1 | 3/4 | 1/4\nDespués';
    const found = tableAt(text, text.indexOf('3/4'));
    expect(found?.cells).toEqual([
      ['Día', 'Antiguo', 'Nuevo'],
      ['Día 1', '3/4', '1/4'],
    ]);
    expect(text.slice(found!.start, found!.end)).toBe('Día | Antiguo | Nuevo\nDía 1 | 3/4 | 1/4');
    expect(tableAt(text, 2)).toBeNull();
    expect(tableText([['Día', 'Nuevo'], ['Día 1 | b', '1/4\n']])).toBe('Día | Nuevo\nDía 1 b | 1/4');
    expect(insertBlock('Antes', 5, 5, 'a | b\nc | d')).toEqual({ text: 'Antes\na | b\nc | d', start: 17, end: 17 });
    expect(insertBlock('', 0, 0, 'a | b\nc | d').text).toBe('a | b\nc | d');
    expect(insertBlock('Uno\nDos', 4, 4, 'x | y\n1 | 2').text).toBe('Uno\nx | y\n1 | 2\nDos');
  });
});
