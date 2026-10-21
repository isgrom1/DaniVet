import { expect, test, type Page } from '@playwright/test';
import { createAccount, dialog, expectToast, menu, rawIndexedDb, shot } from './support';

/**
 * Lectura de informes con IA, con la API de Anthropic simulada (la prueba no usa una clave real ni tiene costo):
 * viene desactivada, se activa con la clave de la profesional, lee la foto de un informe solo cuando ella lo pide
 * y lo leído se revisa antes de agregarlo al examen.
 */

// Sin service worker, para que la simulación de la API reciba todas las solicitudes.
test.use({ serviceWorkers: 'block' });

/** Claves inventadas con el formato de Anthropic (no son claves reales). */
const KEY = 'sk-ant-api03-clave-de-prueba-no-real-0000000000';
const BAD_KEY = 'sk-ant-api03-clave-invalida-de-prueba-111111111';
const TUTOR = 'Rosa Fuentes Díaz';
const PATIENT = 'Bruno';
/** Imagen PNG de 1×1: la "foto" del informe. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
/** Lo que "lee" la IA simulada en la foto. */
const READING = {
  legible: true,
  lineas: [
    { nombre: 'Hematocrito', valor: '45,2', unidad: '%', minimo: '37', maximo: '55' },
    { nombre: 'Leucocitos', valor: '21,4', unidad: 'x10^3/µL', minimo: '6', maximo: '17' },
    { nombre: 'Plaquetas', valor: '310', unidad: 'x10^3/µL', minimo: '200', maximo: '500' },
    { nombre: 'Relación A/G', valor: '0,8', unidad: null, minimo: null, maximo: null },
  ],
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-expose-headers': '*' };

interface ApiRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Simula api.anthropic.com: valida la clave, responde la prueba de la clave y la lectura del informe. */
async function fakeAnthropic(page: Page) {
  const requests: ApiRequest[] = [];
  let failNext: { status: number; body: unknown } | null = null;
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-headers': req.headers()['access-control-request-headers'] ?? '*' } });
      return;
    }
    const headers = await req.allHeaders();
    requests.push({ method: req.method(), url: req.url(), headers, body: req.postData() ?? '' });
    const json = (status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (headers['x-api-key'] !== KEY) return json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    if (req.method() === 'GET') return json(200, { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' });
    if (failNext) {
      const f = failNext;
      failNext = null;
      return json(f.status, f.body);
    }
    return json(200, {
      id: 'msg_prueba',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: JSON.stringify(READING) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 2400, output_tokens: 600 },
    });
  });
  return {
    requests,
    posts: () => requests.filter((r) => r.method === 'POST'),
    failOnce: (status: number, body: unknown) => {
      failNext = { status, body };
    },
  };
}

async function newHemogram(page: Page, patientUrl: string) {
  await page.goto(patientUrl);
  await page.getByRole('tab', { name: 'Exámenes' }).click();
  await page.getByRole('link', { name: 'Nuevo' }).click();
  await page.getByLabel('Tipo de examen').selectOption({ label: 'Hemograma' });
  await expect(page.getByRole('button', { name: 'Ingresar valores del hemograma' })).toBeVisible();
}

test('lectura de informes con IA: activación, lectura de una foto y revisión', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const api = await fakeAnthropic(page);
  await createAccount(page);

  await menu(page, 'Tutores');
  await page.getByRole('link', { name: 'Nuevo' }).click();
  await page.locator('#t-name').fill(TUTOR);
  await page.locator('#t-phone').fill('9 6543 2109');
  await page.getByRole('button', { name: 'Guardar tutor' }).click();
  await expectToast(page, 'Tutor registrado');
  await page.getByRole('link', { name: 'Registrar paciente' }).click();
  await page.locator('#p-name').fill(PATIENT);
  await page.getByLabel('Especie', { exact: true }).selectOption({ label: 'Perro' });
  await page.getByRole('radio', { name: 'Macho' }).click();
  await page.getByRole('button', { name: 'Guardar paciente' }).click();
  await expectToast(page, 'Paciente registrado');
  await expect(page.getByRole('heading', { name: PATIENT })).toBeVisible();
  const patientUrl = page.url();

  await test.step('Viene desactivada: el examen no muestra la lectura con IA', async () => {
    await newHemogram(page, patientUrl);
    await expect(page.getByRole('button', { name: 'Leer foto o PDF con IA' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Dictar o pegar' }).click();
    const sheet = dialog(page, 'Dictar o pegar valores');
    await expect(sheet.getByText('Con IA (opcional):')).toBeVisible();
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    expect(api.requests).toHaveLength(0);
    // El formulario del examen oculta la barra inferior: se vuelve a la ficha para ir a "Más".
    await page.goto(patientUrl);
  });

  await test.step('Activar con la clave propia: se prueba antes de guardarla y queda cifrada', async () => {
    await menu(page, 'Lectura de informes con IA');
    await expect(page.getByText('Desactivada', { exact: true })).toBeVisible();
    const save = page.getByRole('button', { name: 'Guardar y probar' });
    await page.getByLabel('Clave de API de Claude').fill(BAD_KEY);
    // Primero hay que aceptar el aviso de qué se envía.
    await expect(save).toBeDisabled();
    await page.getByRole('checkbox', { name: /Entiendo que las fotos o PDF que elija se enviarán a Anthropic/ }).check();
    await save.click();
    await expect(page.getByText('La clave no es válida o fue eliminada', { exact: false })).toBeVisible();
    await page.getByLabel('Clave de API de Claude').fill(KEY);
    await save.click();
    await expectToast(page, 'Lectura con IA activada');
    await expect(page.getByText(/Clave terminada en …0000/)).toBeVisible();
    const check = api.requests.filter((r) => r.method === 'GET').at(-1)!;
    expect(check.url).toBe('https://api.anthropic.com/v1/models/claude-opus-5-5');
    expect(check.headers['x-api-key']).toBe(KEY);
    // La clave no queda legible en el almacenamiento del teléfono.
    expect(await rawIndexedDb(page)).not.toContain('sk-ant');
    await shot(page, testInfo, 'ia01-activada');
  });

  await test.step('Leer la foto del informe: se envía solo al tocar «Leer con IA»', async () => {
    await newHemogram(page, patientUrl);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Leer foto o PDF con IA' }).click()]);
    await chooser.setFiles({ name: 'informe.png', mimeType: 'image/png', buffer: PNG });
    const sheet = dialog(page, 'Leer informe con IA');
    await expect(sheet.getByRole('img', { name: 'Informe: informe.png' })).toBeVisible();
    await expect(sheet.getByText('Se enviará a Anthropic (Claude) solo para leer los resultados', { exact: false })).toBeVisible();
    expect(api.posts()).toHaveLength(0);

    // Una cuenta sin saldo: se explica y se puede reintentar.
    api.failOnce(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } });
    await sheet.getByRole('button', { name: 'Leer con IA' }).click();
    await expect(sheet.getByText('Tu cuenta de Anthropic no tiene saldo', { exact: false })).toBeVisible();
    await sheet.getByRole('button', { name: 'Intentar de nuevo' }).click();
    await expect(sheet.getByText('La IA transcribió 4 líneas')).toBeVisible();

    // Lo leído queda en el cuadro de texto y la app lo interpreta como un informe pegado.
    await expect(sheet.getByLabel('Valores dictados o pegados')).toHaveValue(/Hematocrito 45,2 % 37 - 55/);
    await expect(sheet.getByRole('checkbox', { name: /Hematocrito: 45,2 % \(ref\. 37–55\)/ })).toBeChecked();
    await expect(sheet.getByRole('checkbox', { name: /Leucocitos: 21,4 ×10³\/µL \(ref\. 6–17\)/ })).toBeChecked();
    await expect(sheet.getByRole('checkbox', { name: /Plaquetas: 310 ×10³\/µL \(ref\. 200–500\)/ })).toBeChecked();
    await expect(sheet.getByText('«Relación A/G 0,8»')).toBeVisible();

    // Lo que se envió: la foto (en JPEG), al modelo indicado, con la clave de la profesional y sin datos de la ficha.
    expect(api.posts()).toHaveLength(2);
    const post = api.posts().at(-1)!;
    expect(post.url).toBe('https://api.anthropic.com/v1/messages?beta=true');
    expect(post.headers['x-api-key']).toBe(KEY);
    expect(post.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(post.body) as { model: string; messages: Array<{ content: Array<Record<string, unknown>> }> };
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    for (const personal of [PATIENT, TUTOR, 'Daniela']) expect(post.body).not.toContain(personal);
    await shot(page, testInfo, 'ia02-lectura');

    // Leer otro archivo (por ejemplo, otra página): lo nuevo se suma al texto y cada valor aparece una sola vez.
    const [again] = await Promise.all([page.waitForEvent('filechooser'), sheet.getByRole('button', { name: 'Leer otro informe' }).click()]);
    await again.setFiles({ name: 'pagina-2.png', mimeType: 'image/png', buffer: PNG });
    await sheet.getByRole('button', { name: 'Leer con IA' }).click();
    await expect(sheet.getByLabel('Valores dictados o pegados')).toHaveValue(/Hematocrito[\s\S]*Hematocrito/);
    expect(api.posts()).toHaveLength(3);
    await expect(sheet.getByRole('checkbox', { name: /Hematocrito:/ })).toHaveCount(1);

    // La profesional decide: las plaquetas no se agregan.
    await sheet.getByRole('checkbox', { name: /Plaquetas: 310/ }).uncheck();
    await sheet.getByRole('button', { name: 'Agregar 2 valores' }).click();
    await expect(page.getByLabel('Hematocrito: valor')).toHaveValue('45,2');
    await expect(page.getByLabel('Leucocitos: valor')).toHaveValue('21,4');
    await expect(page.getByLabel('Leucocitos: referencia máxima')).toHaveValue('17');
    await expect(page.getByLabel('Plaquetas: valor')).toHaveCount(0);
    await expect(page.getByText('Alto', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Guardar examen' }).click();
    await expect(page).toHaveURL(/#\/examenes\/(?!nuevo)[^/?]+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Hemograma' })).toBeVisible();
  });

  await test.step('Desactivar: se borra la clave y el examen deja de ofrecer la lectura', async () => {
    const examUrl = page.url();
    await page.goto(patientUrl);
    await menu(page, 'Lectura de informes con IA');
    await page.getByRole('button', { name: 'Desactivar y borrar la clave' }).click();
    await dialog(page, '¿Desactivar la lectura con IA?').getByRole('button', { name: 'Desactivar' }).click();
    await expectToast(page, 'Lectura con IA desactivada');
    await expect(page.getByText('Desactivada', { exact: true })).toBeVisible();
    await page.goto(examUrl);
    await expect(page.getByLabel('Hematocrito: valor')).toHaveValue('45,2');
    await expect(page.getByRole('button', { name: 'Leer foto o PDF con IA' })).toHaveCount(0);
  });

  expect(pageErrors).toEqual([]);
});
