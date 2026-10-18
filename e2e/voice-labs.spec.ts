import { expect, test, type Page } from '@playwright/test';
import { addDaysISO, createAccount, dialog, expectToast, menu, shot, todaySantiago } from './support';

/**
 * Dictado de la consulta (con el micrófono del teclado del iPhone el texto llega al cuadro igual que al escribirlo)
 * y valores de exámenes con su evolución.
 */

const TUTOR = 'Paula Morales Vega';
const PATIENT = 'Kira';
const DICTADO =
  'Motivo de consulta vómitos desde ayer. Peso 12,4 kilos. Temperatura 39,2. Frecuencia cardíaca 120. Mucosas rosadas. ' +
  'Abdomen con dolor a la palpación. Resto del examen normal. Diagnóstico presuntivo gastroenteritis. ' +
  'Tratamiento omeprazol 1 mg por kilo oral cada 12 horas por 7 días. Control en 7 días. Frase sin dato conocido.';

/**
 * Guarda el examen nuevo y espera a que la app muestre el examen guardado (el aviso "Examen registrado" de un
 * guardado anterior puede seguir en pantalla, así que no basta con esperarlo).
 */
async function savedExam(page: Page) {
  await page.getByRole('button', { name: 'Guardar examen' }).click();
  await expect(page).toHaveURL(/#\/examenes\/(?!nuevo)[^/?]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Perfil bioquímico' })).toBeVisible();
}

async function tutorAndPatient(page: Page) {
  await menu(page, 'Tutores');
  await page.getByRole('link', { name: 'Nuevo' }).click();
  await page.locator('#t-name').fill(TUTOR);
  await page.locator('#t-phone').fill('9 7654 3210');
  await page.getByRole('button', { name: 'Guardar tutor' }).click();
  await expectToast(page, 'Tutor registrado');
  await page.getByRole('link', { name: 'Registrar paciente' }).click();
  await page.locator('#p-name').fill(PATIENT);
  await page.getByLabel('Especie', { exact: true }).selectOption({ label: 'Perro' });
  await page.getByRole('radio', { name: 'Hembra' }).click();
  await page.getByRole('button', { name: 'Guardar paciente' }).click();
  await expectToast(page, 'Paciente registrado');
  await expect(page.getByRole('heading', { name: PATIENT })).toBeVisible();
}

test('dictado de la consulta y evolución de los exámenes', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await createAccount(page);
  await tutorAndPatient(page);
  const patientUrl = page.url();

  await test.step('Dictar la consulta: la app propone dónde va cada dato', async () => {
    await page.getByRole('link', { name: 'Consulta', exact: true }).click();
    await page.getByRole('button', { name: 'Comenzar consulta' }).click();
    await expect(page.getByRole('heading', { name: PATIENT })).toBeVisible();
    // Antes de dictar: avisa los datos importantes que faltan.
    const missing = page.getByRole('region', { name: 'Datos importantes sin registrar' });
    await expect(missing).toContainText('Peso');
    await page.getByRole('button', { name: 'Dictar la consulta' }).click();
    const sheet = dialog(page, 'Dictar la consulta');
    await expect(sheet.getByText('micrófono del teclado')).toBeVisible();
    await sheet.getByLabel('Texto dictado').fill(DICTADO);
    await expect(sheet.getByRole('checkbox', { name: /Motivo principal: Vómitos desde ayer/ })).toBeChecked();
    await expect(sheet.getByRole('checkbox', { name: /Peso: 12,4 kg/ })).toBeChecked();
    await expect(sheet.getByRole('checkbox', { name: /Digestivo y abdominal: Alterado · Dolor a la palpación/ })).toBeChecked();
    await expect(sheet.getByRole('checkbox', { name: /Tratamiento: Omeprazol · 1 mg\/kg · Oral · Cada 12 horas · 7 días/ })).toBeChecked();
    await expect(sheet.getByText('No se pudo ubicar')).toBeVisible();
    await expect(sheet.getByText('«Frase sin dato conocido»')).toBeVisible();
    // Lo que falta después de agregar lo dictado.
    await expect(sheet.getByText('Datos importantes que aún faltarían')).toBeVisible();
    await expect(sheet.getByText(/^Frecuencia respiratoria · Llenado capilar/)).toBeVisible();
    // La profesional decide: la temperatura no se agrega.
    await sheet.getByRole('checkbox', { name: /Temperatura: 39,2 °C/ }).uncheck();
    await shot(page, testInfo, 'v01-dictado');
    await sheet.getByRole('button', { name: /^Agregar \d+ datos a la ficha$/ }).click();
    await expectToast(page, /dato\(s\) agregados/);
  });

  await test.step('Los datos dictados quedan en su lugar, marcados para revisar', async () => {
    await expect(page.getByLabel(/^Motivo principal/)).toHaveValue('Vómitos desde ayer');
    await expect(page.getByLabel(/^Peso/)).toHaveValue('12,4');
    await expect(page.getByLabel(/^Temperatura/)).toHaveValue('');
    await expect(page.getByLabel(/^Frec\. cardíaca/)).toHaveValue('120');
    await expect(page.getByRole('radiogroup', { name: 'Digestivo y abdominal' }).getByRole('radio', { name: 'Alterado' })).toBeChecked();
    await expect(page.getByRole('radiogroup', { name: 'Neurológico' }).getByRole('radio', { name: 'Normal' })).toBeChecked();
    await expect(page.getByLabel('Diagnóstico 1')).toHaveValue('Gastroenteritis');
    await expect(page.getByLabel('Tratamiento 1')).toHaveValue('Omeprazol');
    await expect(page.getByText('Dictado: revisar').first()).toBeVisible();
    const missing = page.getByRole('region', { name: 'Datos importantes sin registrar' });
    await expect(missing).toContainText('Temperatura');
    await expect(missing).not.toContainText('Peso');
    await expect(page.getByRole('button', { name: 'Finalizar consulta' })).toBeDisabled();
    // Corregir un dato dictado lo deja revisado.
    await page.getByLabel(/^Peso/).fill('12,5');
    await expect(page.getByText('Dictado · revisado').first()).toBeVisible();
    await shot(page, testInfo, 'v02-ficha-dictada');
    await page.getByRole('button', { name: /Marcar lo dictado como revisado/ }).click();
    await dialog(page, 'Marcar lo dictado como revisado').getByRole('button', { name: 'Sí, los revisé' }).click();
    await expect(page.getByRole('button', { name: 'Finalizar consulta' })).toBeEnabled();
    await page.getByRole('button', { name: 'Finalizar consulta' }).click();
    const fin = dialog(page, 'Finalizar consulta');
    await expect(fin).toContainText('Datos importantes sin registrar: Temperatura');
    await fin.getByRole('button', { name: 'Finalizar' }).click();
    await expectToast(page, 'Consulta finalizada');
    await page.getByText('Texto dictado (1)').click();
    await expect(page.getByText(/Frase sin dato conocido/)).toBeVisible();
    await shot(page, testInfo, 'v03-consulta-finalizada');
  });

  await test.step('Valores de un examen, con el rango que informa el laboratorio', async () => {
    await page.goto(patientUrl);
    await page.getByRole('tab', { name: 'Exámenes' }).click();
    await page.getByRole('link', { name: 'Nuevo' }).click();
    await page.getByLabel('Tipo de examen').selectOption({ label: 'Perfil bioquímico' });
    await page.locator('input[type="date"]').first().fill(addDaysISO(todaySantiago(), -60));
    await page.getByLabel('Laboratorio o centro').fill('Laboratorio Centro');
    await page.getByLabel('Estado del examen').selectOption({ label: 'Revisado' });
    // La app no trae rangos: los campos de referencia comienzan vacíos.
    await page.getByRole('button', { name: 'Ingresar valores de bioquímica' }).click();
    await expect(page.getByLabel('Creatinina: referencia mínima')).toHaveValue('');
    await page.getByLabel('Creatinina: valor').fill('1,2');
    await page.getByLabel('Creatinina: referencia mínima').fill('0,5');
    await page.getByLabel('Creatinina: referencia máxima').fill('1,5');
    await page.getByLabel('ALT (GPT): valor').fill('60');
    await page.getByLabel('ALT (GPT): referencia mínima').fill('10');
    await page.getByLabel('ALT (GPT): referencia máxima').fill('100');
    await savedExam(page);
  });

  await test.step('Segundo examen dictado: rango recordado, valor anterior y alerta', async () => {
    await page.goto(patientUrl);
    await page.getByRole('tab', { name: 'Exámenes' }).click();
    await page.getByRole('link', { name: 'Nuevo' }).click();
    await page.getByLabel('Tipo de examen').selectOption({ label: 'Perfil bioquímico' });
    await page.getByLabel('Laboratorio o centro').fill('Laboratorio Centro');
    await page.getByLabel('Estado del examen').selectOption({ label: 'Revisado' });
    await page.getByRole('button', { name: 'Dictar o pegar' }).click();
    const sheet = dialog(page, 'Dictar o pegar valores');
    await sheet.getByLabel('Valores dictados o pegados').fill('creatinina 1,9, ALT 85, glucosa 110 referencia 70 a 120');
    await expect(sheet.getByRole('checkbox', { name: /Creatinina: 1,9 mg\/dL/ })).toBeChecked();
    await expect(sheet.getByRole('checkbox', { name: /Glucosa: 110 mg\/dL \(ref\. 70–120\)/ })).toBeChecked();
    await sheet.getByRole('button', { name: 'Agregar 3 valores' }).click();
    await expect(page.getByLabel('Creatinina: valor')).toHaveValue('1,9');
    // Rango recordado del informe anterior del mismo laboratorio, y valor anterior con su cambio.
    await expect(page.getByLabel('Creatinina: referencia máxima')).toHaveValue('1,5');
    await expect(page.getByText('Anterior 1,2', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('+0,7').first()).toBeVisible();
    await expect(page.getByText('Alto', { exact: true }).first()).toBeVisible();
    await shot(page, testInfo, 'v04-valores-examen');
    await savedExam(page);
  });

  await test.step('Evolución de valores: tabla, filtros y gráfico', async () => {
    await page.goto(patientUrl);
    await page.getByRole('tab', { name: 'Exámenes' }).click();
    await expect(page.getByText(/3 valores · 1 fuera de rango/)).toBeVisible();
    await page.getByRole('radio', { name: 'Evolución de valores' }).click();
    const crea = page.getByRole('row', { name: /Creatinina/ });
    await expect(crea).toContainText('1,9');
    await expect(crea).toContainText('1,2');
    await expect(crea.getByLabel('alto')).toBeVisible();
    await page.getByRole('button', { name: 'Solo fuera de rango', pressed: false }).click();
    await expect(page.getByRole('row', { name: /ALT/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Creatinina/ })).toBeVisible();
    await page.getByRole('button', { name: 'Solo fuera de rango', pressed: true }).click();
    // Un examen específico, comparado con el anterior.
    const examSelect = page.getByLabel('Examen', { exact: true });
    await examSelect.selectOption({ index: 1 });
    await expect(page.getByRole('columnheader', { name: /Este examen/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Creatinina/ })).toContainText('+0,7');
    await examSelect.selectOption({ index: 0 });
    await page.getByPlaceholder('Buscar un valor (ej.: creatinina)').fill('gpt');
    await expect(page.getByRole('row', { name: /ALT/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Creatinina/ })).toHaveCount(0);
    await page.getByPlaceholder('Buscar un valor (ej.: creatinina)').fill('');
    await shot(page, testInfo, 'v05-evolucion-tabla');
    await page.getByRole('button', { name: 'Ver evolución de Creatinina' }).click();
    const sheet = dialog(page, 'Creatinina (mg/dL)');
    await expect(sheet.getByRole('img', { name: /Creatinina: 2 valores .* Último: 1,9 mg\/dL \(alto\)/ })).toBeVisible();
    await expect(sheet.getByText('Rango de referencia del informe')).toBeVisible();
    await expect(sheet.getByRole('row', { name: /1,9/ })).toContainText('0,5–1,5');
    await shot(page, testInfo, 'v06-evolucion-grafico');
  });

  expect(pageErrors).toEqual([]);
});
