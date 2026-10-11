import { expect, type Browser, type Download, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { extractPdfText } from '../src/test/pdfText';

export const PASS = 'gato verde salta tres veces';
export const VET_NAME = 'Daniela Prueba Soto';

/** Fecha local de Santiago (la misma zona horaria que usa el navegador emulado). */
export function todaySantiago(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function artifactsDir(testInfo: TestInfo): string {
  const dir = path.join('e2e', '.artifacts', testInfo.project.name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function shot(page: Page, testInfo: TestInfo, name: string) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(artifactsDir(testInfo), `${name}.png`), fullPage: true });
}

export async function saveDownload(dl: Download, testInfo: TestInfo): Promise<{ file: string; bytes: Uint8Array }> {
  const file = testInfo.outputPath(dl.suggestedFilename());
  await dl.saveAs(file);
  return { file, bytes: new Uint8Array(readFileSync(file)) };
}

export async function clickAndDownload(page: Page, target: Locator, testInfo: TestInfo) {
  const [dl] = await Promise.all([page.waitForEvent('download'), target.click()]);
  return { name: dl.suggestedFilename(), ...(await saveDownload(dl, testInfo)) };
}

export async function readPdf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return { pages: doc.getPageCount(), title: doc.getTitle(), text: extractPdfText(bytes).replace(/\s+/g, ' ') };
}

/** Contexto nuevo con la misma emulación de iPhone del proyecto ("otro teléfono" o "otra persona"). */
export async function newPhoneContext(browser: Browser, testInfo: TestInfo) {
  const u = testInfo.project.use as Record<string, unknown>;
  return browser.newContext({
    viewport: u.viewport as { width: number; height: number },
    userAgent: u.userAgent as string,
    deviceScaleFactor: u.deviceScaleFactor as number,
    isMobile: u.isMobile as boolean,
    hasTouch: u.hasTouch as boolean,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    baseURL: (u.baseURL as string) ?? 'http://localhost:4173/',
    acceptDownloads: true,
  });
}

const TAB_TITLE = { Inicio: /^(Buenos días|Buenas tardes|Buenas noches)/, Agenda: 'Agenda', Pacientes: 'Pacientes', Más: 'Más opciones' } as const;

/**
 * Navega con la barra inferior o el menú "Más", como lo haría la usuaria, y espera a que la pantalla nueva
 * esté dibujada (React Router renderiza la navegación como transición).
 */
export async function tab(page: Page, name: keyof typeof TAB_TITLE) {
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name: TAB_TITLE[name] })).toBeVisible();
}

export async function menu(page: Page, item: string | RegExp) {
  await tab(page, 'Más');
  const link = page.getByRole('link', { name: item });
  const href = (await link.getAttribute('href'))!;
  await link.click();
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(page).toHaveURL(new RegExp(`${escaped}$`));
}

export const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible();
}

/** Crea la cuenta desde la pantalla de bienvenida y devuelve la clave de recuperación mostrada. */
export async function createAccount(page: Page, testInfo?: TestInfo): Promise<string> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await page.getByLabel('Nombre completo').fill(VET_NAME);
  await page.getByLabel('Título profesional').fill('Médica Veterinaria');
  await page.locator('#pass').fill(PASS);
  await page.locator('#pass2').fill(PASS);
  await page.getByRole('checkbox').check();
  if (testInfo) await shot(page, testInfo, '01-crear-cuenta');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  const key = (await page.getByTestId('recovery-key').innerText()).trim();
  if (testInfo) await shot(page, testInfo, '02-clave-recuperacion');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Ahora no' }).click();
  await page.getByRole('button', { name: /^Comenzar a usar / }).click();
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  return key;
}

export async function unlock(page: Page, pass = PASS) {
  await expect(page.getByRole('heading', { name: 'Desbloquear' })).toBeVisible();
  await page.getByLabel('Contraseña', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
}

/** Lee todo lo que la app guardó en IndexedDB, tal como quedaría en el disco del teléfono. */
export async function rawIndexedDb(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('vetcasa');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const out: Record<string, unknown[]> = {};
    for (const name of Array.from(db.objectStoreNames)) {
      out[name] = await new Promise<unknown[]>((res, rej) => {
        const q = db.transaction(name, 'readonly').objectStore(name).getAll();
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    }
    db.close();
    const dec = new TextDecoder();
    return JSON.stringify(out, (_k, v) => {
      if (v instanceof ArrayBuffer) return dec.decode(new Uint8Array(v));
      if (ArrayBuffer.isView(v)) return dec.decode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      return v;
    });
  });
}
