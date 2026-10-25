import { expect, test, type Locator, type Page } from '@playwright/test';
import { clickAndDownload, createAccount, dialog, expectToast, menu, readPdf, shot } from './support';

/**
 * Indicaciones al tutor con formato (subtítulos, negritas, viñetas y tablas) y para varios pacientes del mismo
 * tutor, con su peso (por ejemplo, gatitos de una camada).
 */

const TUTOR = 'Camila Rojas Pérez';

async function patient(page: Page, name: string, weight: string, first: boolean) {
  await menu(page, 'Tutores');
  await page.getByRole('link', { name: new RegExp(TUTOR) }).click();
  await page.getByRole('link', { name: first ? 'Registrar paciente' : 'Agregar' }).click();
  await page.locator('#p-name').fill(name);
  await page.getByLabel('Especie', { exact: true }).selectOption({ label: 'Gato' });
  await page.getByLabel('Peso actual').fill(weight);
  await page.getByRole('button', { name: 'Guardar paciente' }).click();
  await expectToast(page, 'Paciente registrado');
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return page.url();
}

/** Ubica el cursor (o selecciona) en el cuadro de texto, como al tocarlo. */
async function select(field: Locator, from: string | number, length = 0) {
  await field.evaluate(
    (el: HTMLTextAreaElement, [f, n]) => {
      const i = typeof f === 'number' ? f : f === '' ? el.value.length : el.value.indexOf(f);
      el.focus();
      el.setSelectionRange(i, i + n);
    },
    [from, length] as const,
  );
}

test('indicaciones con formato para dos gatitos del mismo tutor', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await createAccount(page);
  await menu(page, 'Tutores');
  await page.getByRole('link', { name: 'Nuevo' }).click();
  await page.locator('#t-name').fill(TUTOR);
  await page.locator('#t-phone').fill('9 6543 2109');
  await page.getByRole('button', { name: 'Guardar tutor' }).click();
  await expectToast(page, 'Tutor registrado');
  const pipuUrl = await patient(page, 'Pipu', '1,21', true);
  await patient(page, 'Larry', '1,58', false);

  await test.step('Escribir las indicaciones con la barra de formato', async () => {
    await page.goto(pipuUrl);
    await page.getByRole('link', { name: 'Consulta', exact: true }).click();
    await page.getByRole('button', { name: 'Comenzar consulta' }).click();
    await expect(page.getByRole('heading', { name: 'Pipu' })).toBeVisible();
    await page.getByLabel('Motivo principal').fill('Diarrea líquida');
    await page.getByRole('button', { name: '3. Examen físico' }).click();
    await page.getByLabel('Peso', { exact: true }).fill('1,21');
    await page.getByRole('button', { name: '5. Plan de manejo' }).click();

    const care = page.getByLabel('Cuidados domiciliarios');
    const bar = page.getByRole('toolbar', { name: 'Formato del texto' }).first();
    await care.fill('1. Tratamiento de diarrea líquida');
    await bar.getByRole('button', { name: 'Subtítulo' }).click();
    await expect(care).toHaveValue('## 1. Tratamiento de diarrea líquida');
    await select(care, '');
    await care.pressSequentially('\nOfrecer al día 50 gramos de pellet.');
    await select(care, '50 gramos', '50 gramos'.length);
    await bar.getByRole('button', { name: 'Negrita' }).click();
    await bar.getByRole('button', { name: 'Viñeta' }).click();
    await expect(care).toHaveValue('## 1. Tratamiento de diarrea líquida\n• Ofrecer al día **50 gramos** de pellet.');

    // Tabla nueva al final del texto.
    await select(care, '');
    await bar.getByRole('button', { name: 'Tabla' }).click();
    const add = dialog(page, 'Agregar tabla');
    const cells = [
      ['Día', 'Alimento antiguo', 'Alimento nuevo'],
      ['Día 1', '3/4', '1/4'],
      ['Día 2', '1/2', '1/2'],
    ];
    for (const [i, row] of cells.entries()) {
      for (const [j, value] of row.entries()) await add.getByLabel(i === 0 ? `Título de la columna ${j + 1}` : `Fila ${i}, columna ${j + 1}`).fill(value);
    }
    await shot(page, testInfo, 'i01-agregar-tabla');
    await add.getByRole('button', { name: 'Agregar tabla' }).click();
    await expect(care).toHaveValue(/\nDía \| Alimento antiguo \| Alimento nuevo\nDía 1 \| 3\/4 \| 1\/4\nDía 2 \| 1\/2 \| 1\/2$/);

    // Con el cursor en la tabla, «Tabla» la abre para editarla.
    await select(care, '3/4');
    await bar.getByRole('button', { name: 'Tabla' }).click();
    const edit = dialog(page, 'Editar tabla');
    await expect(edit.getByLabel('Fila 2, columna 1')).toHaveValue('Día 2');
    await edit.getByRole('button', { name: 'Agregar fila' }).click();
    await edit.getByLabel('Fila 3, columna 1').fill('Día 3');
    await edit.getByLabel('Fila 3, columna 2').fill('1/4');
    await edit.getByLabel('Fila 3, columna 3').fill('3/4');
    await edit.getByRole('button', { name: 'Guardar tabla' }).click();
    await expect(care).toHaveValue(/Día 2 \| 1\/2 \| 1\/2\nDía 3 \| 1\/4 \| 3\/4$/);

    await page.getByText('Vista previa con formato').first().click();
    await expect(page.getByRole('table').first()).toContainText('Día 3');
    await shot(page, testInfo, 'i02-indicaciones-con-formato');
    await page.getByLabel('Recomendaciones al tutor').fill('Vacuna Triple Felina con dos refuerzos cada 14 a 28 días.');

    await page.getByRole('button', { name: 'Finalizar consulta' }).click();
    await dialog(page, 'Finalizar consulta').getByRole('button', { name: 'Finalizar' }).click();
    await expectToast(page, 'Consulta finalizada');
    // La consulta muestra el texto con formato, sin las marcas.
    await expect(page.getByText('1. Tratamiento de diarrea líquida')).toBeVisible();
    await expect(page.getByRole('table').first()).toContainText('Día 3');
    await expect(page.getByText(/##|\*\*/)).toHaveCount(0);
  });

  await test.step('Un solo PDF para Pipu y Larry, con el peso de cada uno', async () => {
    await page.getByRole('button', { name: 'Indicaciones al tutor' }).click();
    const ask = dialog(page, 'Indicaciones al tutor');
    await expect(ask.getByRole('checkbox', { name: /Pipu/ })).toBeChecked();
    await expect(ask.getByRole('checkbox', { name: /Pipu/ })).toBeDisabled();
    // Ningún otro paciente viene marcado.
    await expect(ask.getByRole('checkbox', { name: /Larry/ })).not.toBeChecked();
    await expect(ask.getByText(/último peso 1,58 kg/)).toBeVisible();
    await ask.getByRole('checkbox', { name: /Larry/ }).check();
    await shot(page, testInfo, 'i03-elegir-pacientes');
    await ask.getByRole('button', { name: 'Generar PDF' }).click();
    const pdf = await clickAndDownload(page, dialog(page, 'Documento listo').getByRole('button', { name: 'Descargar' }), testInfo);
    expect(pdf.name).toMatch(/^indicaciones-Pipu_y_Larry-\d{4}-\d{2}-\d{2}\.pdf$/);
    const doc = await readPdf(pdf.bytes);
    for (const s of ['Indicaciones posteriores a la atención', 'Pipu y Larry ·', 'Paciente Peso', 'Pipu 1,21 kg', 'Larry 1,58 kg', '1. Tratamiento de diarrea líquida', 'Ofrecer al día 50 gramos de pellet.', 'Día Alimento antiguo Alimento nuevo', 'Día 3 1/4 3/4', 'Vacuna Triple Felina']) {
      expect(doc.text).toContain(s);
    }
    expect(doc.text).not.toMatch(/\*\*|##|\|/);
    await dialog(page, 'Documento listo').getByRole('button', { name: 'Cerrar' }).click();
  });

  await test.step('Documento de indicaciones para los dos, desde la ficha', async () => {
    await page.goto(pipuUrl);
    await page.getByRole('link', { name: 'Documento', exact: true }).click();
    await page.getByRole('button', { name: 'Indicaciones posteriores a la atención' }).click();
    const also = page.getByRole('group', { name: 'También para' });
    await expect(also.getByRole('checkbox', { name: /Larry/ })).not.toBeChecked();
    await also.getByRole('checkbox', { name: /Larry/ }).check();
    const text = page.getByRole('textbox', { name: /^Indicaciones/ });
    await text.fill('Desparasitación');
    await page.getByRole('toolbar', { name: 'Formato del texto' }).first().getByRole('button', { name: 'Subtítulo' }).click();
    await select(text, '');
    await text.pressSequentially('\nInterna y externa cada 15 días, por 4 dosis.');
    await page.getByRole('button', { name: 'Emitir' }).click();
    await dialog(page, 'Emitir documento').getByRole('button', { name: 'Emitir' }).click();
    await expectToast(page, 'Documento emitido');
    await shot(page, testInfo, 'i04-documento-indicaciones');
    await page.getByRole('button', { name: 'Ver / compartir PDF' }).click();
    const pdf = await clickAndDownload(page, dialog(page, 'Documento listo').getByRole('button', { name: 'Descargar' }), testInfo);
    const doc = await readPdf(pdf.bytes);
    for (const s of ['Paciente Especie / raza Peso', 'Pipu Gato 1,21 kg', 'Larry Gato 1,58 kg', 'Desparasitación', 'Interna y externa cada 15 días, por 4 dosis.']) {
      expect(doc.text).toContain(s);
    }
    expect(doc.text).not.toMatch(/##/);
  });

  expect(pageErrors).toEqual([]);
});
