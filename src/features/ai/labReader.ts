import { z } from 'zod';
import { toB64 } from '@/lib/crypto';

/**
 * Lectura opcional de informes de laboratorio (foto o PDF) con Claude, de Anthropic, usando la clave de la
 * profesional. La IA solo transcribe lo escrito (nombre, valor, unidad y rango); la app interpreta esas líneas con
 * el mismo intérprete del texto pegado, y la profesional revisa cada valor antes de agregarlo.
 */

export const AI_MODEL = 'claude-opus-5-5';
/** Fotos o PDF por lectura (por ejemplo, las páginas de un mismo informe). */
export const MAX_FILES = 5;
/** Lado mayor de las fotos que se envían: más grande no mejora la lectura y solo tarda más en subir. */
const MAX_SIDE = 1568;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
/** Límite de la solicitud a Anthropic (32 MB), con margen. */
const MAX_TOTAL_B64 = 28 * 1024 * 1024;

export class AiError extends Error {}

export interface ReportFile {
  name: string;
  kind: 'image' | 'pdf';
  /** Contenido en base64 (las fotos, en JPEG). */
  data: string;
}

const Reading = z.object({
  legible: z.boolean().describe('false si el archivo no es un informe de laboratorio o no se puede leer'),
  lineas: z.array(
    z.object({
      nombre: z.string().describe('Nombre del examen tal como aparece, con su sigla si la tiene'),
      valor: z.string().describe('Resultado tal como aparece'),
      unidad: z.string().nullable(),
      minimo: z.string().nullable().describe('Límite inferior del rango de referencia que informa el laboratorio'),
      maximo: z.string().nullable().describe('Límite superior del rango de referencia que informa el laboratorio'),
    }),
  ),
});
export type Reading = z.infer<typeof Reading>;

export const SYSTEM_PROMPT = [
  'Transcribes informes de laboratorio veterinario (fotos o PDF) para que una médica veterinaria revise cada resultado antes de registrarlo en la ficha.',
  '',
  'Reglas:',
  '- Copia solo lo que está escrito en el informe. No calcules, no completes, no corrijas ni interpretes. Si un valor, una unidad o un rango no se lee con seguridad, omite esa línea o ese dato.',
  '- Una línea por resultado: el nombre del examen tal como aparece (con su sigla si la tiene, por ejemplo «ALT (GPT)»), el valor, la unidad y el rango de referencia que informa el laboratorio.',
  '- Números con coma decimal y sin separador de miles (por ejemplo 12,5 o 250000). Potencias de diez como x10^3 o x10^6 (por ejemplo x10^3/µL).',
  '- Si el rango tiene solo límite superior o solo inferior, deja el otro en null. Si no hay rango o unidad, usa null.',
  '- Los resultados no numéricos (por ejemplo Negativo, Trazas o ++) van como valor, tal como aparecen.',
  '- No incluyas marcas de alto o bajo (H, L, *, flechas), comentarios, ni datos del paciente, del tutor, del laboratorio o de la profesional.',
  '- Si el archivo no es un informe de laboratorio o no se puede leer, responde legible = false y sin líneas.',
].join('\n');

/** Primer número de un límite de rango ("< 1,5" → "1,5"). */
const limit = (s: string | null) => s?.match(/\d[\d.,]*/)?.[0];

/**
 * Convierte la transcripción en líneas como las de un informe pegado ("Creatinina 1,9 mg/dL 0,5 - 1,5"),
 * que la app interpreta igual que el texto copiado de una foto o un PDF.
 */
export function linesFromReading(r: Reading): string[] {
  return r.lineas
    .map((l) => {
      const unit = l.unidad?.trim() ?? '';
      let value = l.valor.trim();
      if (unit && value.endsWith(unit)) value = value.slice(0, -unit.length).trim();
      const [min, max] = [limit(l.minimo), limit(l.maximo)];
      const range = min && max ? `${min} - ${max}` : max ? `< ${max}` : min ? `> ${min}` : '';
      return [l.nombre.trim(), value, unit, range].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    })
    .filter((s) => /\d|[a-z]/i.test(s));
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name);

/** Prepara una foto (reducida y en JPEG) o un PDF para enviarlo. */
export async function prepareFile(file: File): Promise<ReportFile> {
  if (isPdf(file)) {
    if (file.size > MAX_PDF_BYTES) throw new AiError(`El PDF «${file.name}» es demasiado grande (máximo 15 MB).`);
    return { name: file.name, kind: 'pdf', data: toB64(new Uint8Array(await file.arrayBuffer())) };
  }
  if (!isImage(file)) throw new AiError(`«${file.name}» no es una foto ni un PDF.`);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new AiError(`No se pudo abrir la imagen «${file.name}».`);
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AiError('No se pudo preparar la imagen.');
    // Fondo blanco por si la imagen tiene transparencia.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    // Libera la memoria del lienzo de inmediato (en iPhone es limitada).
    canvas.width = canvas.height = 0;
    if (!blob) throw new AiError('No se pudo preparar la imagen.');
    return { name: file.name, kind: 'image', data: toB64(new Uint8Array(await blob.arrayBuffer())) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

let sdk: typeof import('@anthropic-ai/sdk') | undefined;

/** El SDK de Anthropic se descarga solo cuando se usa la lectura con IA. */
export async function loadSdk() {
  return (sdk ??= await import('@anthropic-ai/sdk'));
}

async function client(apiKey: string) {
  const { default: Anthropic } = await loadSdk();
  // La clave es de la propia profesional y se usa solo desde su teléfono: no hay un servidor intermedio.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 120_000 });
}

/** Comprueba que la clave funcione y tenga acceso al modelo (no tiene costo). */
export async function testApiKey(apiKey: string, signal?: AbortSignal): Promise<void> {
  try {
    await (await client(apiKey)).models.retrieve(AI_MODEL, undefined, { signal });
  } catch (e) {
    throw new AiError(describeError(e));
  }
}

/** Envía las fotos o el PDF a Claude y devuelve los resultados transcritos, una línea por resultado. */
export async function readReport(files: ReportFile[], apiKey: string, signal?: AbortSignal): Promise<string[]> {
  if (files.reduce((n, f) => n + f.data.length, 0) > MAX_TOTAL_B64) throw new AiError('Los archivos son demasiado grandes para enviarlos juntos: elige menos páginas.');
  const [anthropic, { betaZodOutputFormat }] = await Promise.all([client(apiKey), import('@anthropic-ai/sdk/helpers/beta/zod')]);
  const format = betaZodOutputFormat(Reading);
  // Se usa create() y no parse(): así, si el modelo declina o se corta, se informa el motivo en vez de un error de formato.
  const msg = await anthropic.beta.messages
    .create(
      {
        model: AI_MODEL,
        max_tokens: 16000,
        // Si el modelo declina la tarea, Anthropic la reintenta con su modelo alternativo predeterminado.
        betas: ['structured-outputs-2025-12-15', 'server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              ...files.map((f) =>
                f.kind === 'pdf'
                  ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } } as const)
                  : ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } } as const),
              ),
              { type: 'text', text: 'Transcribe los resultados de este informe.' },
            ],
          },
        ],
      },
      { signal },
    )
    .catch((e: unknown) => {
      throw new AiError(describeError(e));
    });
  if (msg.stop_reason === 'refusal') throw new AiError('La IA no pudo leer este archivo. Ingresa los valores de otra forma.');
  if (msg.stop_reason === 'max_tokens') throw new AiError('El informe es demasiado largo para leerlo de una vez: elige menos páginas.');
  let out: Reading | null = null;
  try {
    const text = msg.content.find((b) => b.type === 'text')?.text;
    out = text ? format.parse(text) : null;
  } catch {
    out = null;
  }
  if (!out) throw new AiError('No se pudo leer la respuesta de la IA. Intenta de nuevo.');
  const lines = out.legible ? linesFromReading(out) : [];
  if (!lines.length) throw new AiError('No se encontraron resultados de laboratorio en el archivo. Revisa que la foto sea nítida y muestre el informe completo.');
  return lines;
}

const NO_CREDIT = 'Tu cuenta de Anthropic no tiene saldo o alcanzó su límite de gasto. Revísalo en la Consola de Claude (Billing).';

/** Mensaje en español para los errores de la API (sin detalles técnicos). */
export function describeError(e: unknown): string {
  if (e instanceof AiError) return e.message;
  // El tiempo agotado es un caso particular de error de conexión: se revisa primero.
  if (sdk && e instanceof sdk.APIConnectionTimeoutError) return 'Anthropic tardó demasiado en responder. Intenta de nuevo.';
  if (sdk && e instanceof sdk.APIConnectionError) return 'No hubo conexión con Anthropic. Revisa tu conexión a internet e intenta de nuevo.';
  const err = (e ?? {}) as { status?: number; message?: string; error?: { error?: { type?: string; message?: string } } };
  const detail = `${err.error?.error?.type ?? ''} ${err.error?.error?.message ?? ''} ${err.message ?? ''}`;
  switch (err.status) {
    case 400:
      return /credit balance|billing|usage limit|spend limit/i.test(detail) ? NO_CREDIT : 'Anthropic no pudo procesar el archivo. Prueba con otra foto o con el PDF del informe.';
    case 401:
      return 'La clave no es válida o fue eliminada. Revísala en Más › Lectura de informes con IA.';
    case 402:
      return NO_CREDIT;
    case 403:
      return 'Tu clave no tiene permiso para usar Claude. Revisa tu cuenta en la Consola de Claude.';
    case 404:
      return 'El modelo de lectura no está disponible para tu cuenta de Anthropic.';
    case 413:
      return 'El archivo es demasiado grande. Elige menos páginas o una foto más liviana.';
    case 429:
      return 'Se alcanzó el límite de uso de tu cuenta de Anthropic. Espera un momento e intenta de nuevo.';
    default:
      if (err.status && err.status >= 500) return 'El servicio de Anthropic no está disponible en este momento. Intenta de nuevo en unos minutos.';
      return 'No se pudo completar la lectura con IA. Intenta de nuevo.';
  }
}
