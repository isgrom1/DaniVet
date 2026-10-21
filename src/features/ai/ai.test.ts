import { afterEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { parseLabDictation } from '@/features/voice/labs';
import { createEncryptedBackup, exportOpenData } from '@/features/backup/backup';
import { getDek, setDek } from '@/data/vaultKey';
import { importDek, randomBytes } from '@/lib/crypto';
import { getMeta } from '@/lib/idb';
import { freshAccount } from '@/test/helpers';
import { clearAiConfig, keyHint, loadAiConfig, looksLikeApiKey, saveAiConfig } from './aiKey';
import { AI_MODEL, describeError, linesFromReading, loadSdk, readReport, testApiKey, type Reading, type ReportFile } from './labReader';

/** Clave inventada con el formato de Anthropic (no es una clave real). */
const KEY = 'sk-ant-api03-clave-de-prueba-no-real-0000000000';
const FILES: ReportFile[] = [
  { name: 'informe.jpg', kind: 'image', data: '/9j/4AAQSkZJRg==' },
  { name: 'pagina-2.pdf', kind: 'pdf', data: 'JVBERi0xLjQ=' },
];

const READING: Reading = {
  legible: true,
  lineas: [
    { nombre: 'Hematocrito', valor: '45,2', unidad: '%', minimo: '37', maximo: '55' },
    { nombre: 'Leucocitos', valor: '12,5', unidad: 'x10^3/µL', minimo: '6', maximo: '17' },
    { nombre: 'Plaquetas', valor: '250000', unidad: '/µL', minimo: '200000', maximo: '500000' },
    { nombre: 'ALT (GPT)', valor: '85 U/L', unidad: 'U/L', minimo: null, maximo: '< 100' },
    { nombre: 'Glucosa', valor: '110', unidad: 'mg/dL', minimo: '70', maximo: null },
    { nombre: 'Proteínas en orina', valor: 'Negativo', unidad: null, minimo: null, maximo: null },
    { nombre: 'Relación albúmina/globulina', valor: '0,8', unidad: null, minimo: null, maximo: null },
  ],
};

interface Call {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

/** Simula la API de Anthropic: devuelve las respuestas indicadas en orden y registra cada solicitud. */
function fakeApi(...responses: Array<{ status?: number; body: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : {} });
      const r = responses[Math.min(calls.length, responses.length) - 1];
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json', ...r.headers } });
    }),
  );
  return calls;
}

const message = (text: string, stop_reason = 'end_turn') => ({
  id: 'msg_prueba',
  type: 'message',
  role: 'assistant',
  model: AI_MODEL,
  content: [
    { type: 'thinking', thinking: 'Leo la tabla del informe.', signature: 'firma' },
    { type: 'text', text },
  ],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 2400, output_tokens: 700 },
});

const apiError = (status: number, type: string, msg: string) => ({ status, body: { type: 'error', error: { type, message: msg } }, headers: { 'x-should-retry': 'false' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lectura de informes con IA: transcripción', () => {
  it('convierte lo transcrito en líneas que la app interpreta con su unidad y rango', () => {
    const lines = linesFromReading(READING);
    expect(lines).toEqual([
      'Hematocrito 45,2 % 37 - 55',
      'Leucocitos 12,5 x10^3/µL 6 - 17',
      'Plaquetas 250000 /µL 200000 - 500000',
      'ALT (GPT) 85 U/L < 100',
      'Glucosa 110 mg/dL > 70',
      'Proteínas en orina Negativo',
      'Relación albúmina/globulina 0,8',
    ]);
    const { values, unplaced } = parseLabDictation(lines.join('\n'));
    const by = Object.fromEntries(values.map((v) => [v.code, v]));
    expect(by.hct).toMatchObject({ value: 45.2, unit: '%', refLow: 37, refHigh: 55 });
    expect(by.wbc).toMatchObject({ value: 12.5, unit: '×10³/µL', refLow: 6, refHigh: 17 });
    // Recuento absoluto: se registra en la unidad del catálogo, con su rango.
    expect(by.plt).toMatchObject({ value: 250, unit: '×10³/µL', refLow: 200, refHigh: 500 });
    expect(by.alt).toMatchObject({ value: 85, unit: 'U/L', refHigh: 100 });
    expect(by.alt.refLow).toBeUndefined();
    expect(by.glu).toMatchObject({ value: 110, refLow: 70 });
    expect(by.glu.refHigh).toBeUndefined();
    expect(by.uprot).toMatchObject({ text: 'Negativo' });
    expect(unplaced).toEqual(['Relación albúmina/globulina 0,8']);
  });

  it('envía las fotos y el PDF al modelo con salida estructurada y devuelve las líneas', async () => {
    const calls = fakeApi({ body: message(JSON.stringify(READING)) });
    const lines = await readReport(FILES, KEY);
    expect(lines).toHaveLength(7);
    expect(calls).toHaveLength(1);
    const [{ url, headers, body }] = calls;
    expect(url).toBe('https://api.anthropic.com/v1/messages?beta=true');
    expect(headers.get('x-api-key')).toBe(KEY);
    expect(headers.get('anthropic-beta')).toContain('structured-outputs-2025-12-15');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(body).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 16000, fallbacks: 'default', output_config: { effort: 'medium', format: { type: 'json_schema' } } });
    expect(String(body.system)).toContain('Copia solo lo que está escrito');
    const content = (body.messages as Array<{ content: Array<Record<string, unknown>> }>)[0].content;
    expect(content.map((c) => c.type)).toEqual(['image', 'document', 'text']);
    expect(content[0]).toMatchObject({ source: { type: 'base64', media_type: 'image/jpeg', data: FILES[0].data } });
    expect(content[1]).toMatchObject({ source: { type: 'base64', media_type: 'application/pdf', data: FILES[1].data } });
  });

  it('avisa cuando el modelo declina, no encuentra resultados o la respuesta no sirve', async () => {
    fakeApi({ body: message('', 'refusal') });
    await expect(readReport(FILES, KEY)).rejects.toThrow('La IA no pudo leer este archivo');
    fakeApi({ body: message(JSON.stringify({ legible: false, lineas: [] })) });
    await expect(readReport(FILES, KEY)).rejects.toThrow('No se encontraron resultados de laboratorio');
    fakeApi({ body: message('{"legible": tr') });
    await expect(readReport(FILES, KEY)).rejects.toThrow('No se pudo leer la respuesta de la IA');
    fakeApi({ body: message(JSON.stringify(READING), 'max_tokens') });
    await expect(readReport(FILES, KEY)).rejects.toThrow('demasiado largo');
  });

  it('explica en español los errores de la cuenta o del servicio', async () => {
    fakeApi(apiError(401, 'authentication_error', 'invalid x-api-key'));
    await expect(testApiKey(KEY)).rejects.toThrow('La clave no es válida');
    fakeApi(apiError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'));
    await expect(readReport(FILES, KEY)).rejects.toThrow('no tiene saldo');
    fakeApi(apiError(400, 'invalid_request_error', 'Could not process image'));
    await expect(readReport(FILES, KEY)).rejects.toThrow('no pudo procesar el archivo');
    fakeApi(apiError(429, 'rate_limit_error', 'Number of request tokens has exceeded your rate limit'));
    await expect(readReport(FILES, KEY)).rejects.toThrow('límite de uso');
    fakeApi(apiError(529, 'overloaded_error', 'Overloaded'));
    await expect(readReport(FILES, KEY)).rejects.toThrow('no está disponible en este momento');
    const sdk = await loadSdk();
    expect(describeError(new sdk.APIConnectionTimeoutError())).toContain('tardó demasiado');
    expect(describeError(new sdk.APIConnectionError({ message: 'Connection error.' }))).toContain('No hubo conexión');
  });
});

describe('clave de la API de Claude', () => {
  it('reconoce el formato de las claves', () => {
    expect(looksLikeApiKey(KEY)).toBe(true);
    expect(looksLikeApiKey(`  ${KEY} `)).toBe(true);
    expect(looksLikeApiKey('sk-proj-1234567890abcdefghijklmn')).toBe(false);
    expect(looksLikeApiKey('sk-ant-corta')).toBe(false);
    expect(keyHint(KEY)).toBe('…0000');
  });

  it('se guarda cifrada en el teléfono y no entra en respaldos ni exportaciones', async () => {
    await freshAccount();
    expect(await loadAiConfig()).toBeNull();
    await saveAiConfig({ key: KEY, consentAt: '2026-10-21T12:00:00.000Z' });
    const sealed = await getMeta<{ iv: Uint8Array; ct: Uint8Array }>('aiKey');
    expect(sealed?.ct).toBeDefined();
    const raw = new TextDecoder().decode(new Uint8Array(sealed!.ct));
    expect(raw).not.toContain('sk-ant');
    expect(await loadAiConfig()).toEqual({ key: KEY, consentAt: '2026-10-21T12:00:00.000Z' });

    const zips = [(await createEncryptedBackup({ includeAttachments: true })).blob, (await exportOpenData({ includeAttachments: true })).blob];
    for (const zip of zips) {
      const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
      for (const [name, bytes] of Object.entries(files)) {
        expect(strFromU8(bytes), name).not.toContain('sk-ant');
      }
    }

    // Cifrada con la clave de esta bóveda: otra bóveda no puede leerla.
    const dek = getDek();
    setDek(await importDek(randomBytes(32)));
    expect(await loadAiConfig()).toBeNull();
    setDek(dek);
    await clearAiConfig();
    expect(await loadAiConfig()).toBeNull();
  });
});
