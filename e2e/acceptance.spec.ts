import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { slugify } from '../src/lib/text';
import {
  PASS,
  VET_NAME,
  addDaysISO,
  clickAndDownload,
  createAccount,
  dialog,
  expectToast,
  menu,
  newPhoneContext,
  rawIndexedDb,
  readPdf,
  shot,
  tab,
  todaySantiago,
  unlock,
} from './support';

/**
 * Flujo de aceptación (sección 28): cuenta → tutor → dos animales → visita → paciente → consulta →
 * tratamiento → vacuna → receta PDF → pago → cerrar/reabrir → persistencia → exportación → acceso →
 * respaldo y restauración en otro "teléfono" → modo sin conexión.
 * Se ejecuta en tres tamaños de iPhone emulados con Chromium (WebKit no está disponible en este entorno).
 */

const TUTOR = 'Carolina Fuentes Rojas';
const PHONE = '9 8765 4321';
const MED = 'Antiinflamatorio de prueba';

test('flujo completo de la veterinaria a domicilio', async ({ page, context, browser }, testInfo) => {
  const pageErrors: string[] = [];
  const watch = (p: Page) => p.on('pageerror', (e) => pageErrors.push(e.message));
  watch(page);
  const today = todaySantiago();
  const tomorrow = addDaysISO(today, 1);

  let recoveryKey = '';
  await test.step('1. Crear la cuenta', async () => {
    recoveryKey = await createAccount(page, testInfo);
    expect(recoveryKey).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/);
    await shot(page, testInfo, '03-inicio-vacio');
  });

  await test.step('2. Validaciones del formulario de tutor', async () => {
    await menu(page, 'Tutores');
    await page.getByRole('link', { name: 'Nuevo' }).click();
    await page.getByRole('button', { name: 'Guardar tutor' }).click();
    await expect(page.getByText('Ingresa el nombre completo')).toBeVisible();
    await expect(page.getByText('El teléfono es necesario para coordinar las visitas')).toBeVisible();
    await page.locator('#t-phone').fill('123');
    await page.locator('#t-rut').fill('11.111.111-2');
    await expect(page.getByText('Teléfono no válido (ej.: +56 9 1234 5678)')).toBeVisible();
    await expect(page.getByText('RUT no válido (revisa el dígito verificador)')).toBeVisible();
    await shot(page, testInfo, '04-tutor-validaciones');
  });

  await test.step('3. Registrar al tutor con su dirección', async () => {
    await page.locator('#t-name').fill(TUTOR);
    await page.locator('#t-phone').fill(PHONE);
    await page.locator('#t-rut').fill('');
    await page.getByRole('radio', { name: 'WhatsApp' }).click();
    await page.getByLabel('Calle y número').fill('Av. Apoquindo 4500, depto 1203');
    await page.getByLabel('Comuna').fill('Las Condes');
    await page.getByLabel('Indicaciones para llegar').fill('Conserjería; perro en la terraza');
    await page.getByRole('button', { name: 'Guardar tutor' }).click();
    await expectToast(page, 'Tutor registrado');
    await expect(page.getByRole('heading', { name: TUTOR })).toBeVisible();
    await expect(page.locator('a[href="tel:+56987654321"]').first()).toBeVisible();
    await expect(page.locator('a[href^="https://wa.me/56987654321"]').first()).toBeVisible();
  });

  await test.step('4. Advertencia de posible duplicado (sin fusionar)', async () => {
    await menu(page, 'Tutores');
    await page.getByRole('link', { name: 'Nuevo' }).click();
    await page.locator('#t-name').fill('Otra Persona');
    await page.locator('#t-phone').fill('+56 9 8765 4321');
    await expect(page.getByText('Posibles coincidencias')).toBeVisible();
    await expect(page.getByText('Mismo teléfono')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar tutor' }).click();
    await expect(dialog(page, 'Posible tutor duplicado')).toBeVisible();
    await shot(page, testInfo, '05-duplicado');
    await dialog(page, 'Posible tutor duplicado').getByRole('button', { name: 'Cancelar' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });

  await test.step('5. Dos animales del mismo tutor', async () => {
    await menu(page, 'Tutores');
    await page.getByRole('link', { name: new RegExp(TUTOR) }).click();
    await page.getByRole('link', { name: 'Registrar paciente' }).click();
    await page.locator('#p-name').fill('Toby');
    await page.getByLabel('Especie', { exact: true }).selectOption({ label: 'Perro' });
    await page.getByLabel('Raza').fill('Mestizo');
    await page.getByRole('radio', { name: 'Macho' }).click();
    await page.getByRole('radio', { name: 'Edad estimada' }).click();
    await page.getByLabel('Años', { exact: true }).fill('4');
    await page.getByLabel('Peso actual').fill('12,4');
    await page.getByRole('button', { name: 'Guardar paciente' }).click();
    await expectToast(page, 'Paciente registrado');
    await expect(page.getByRole('heading', { name: 'Toby' })).toBeVisible();
    await shot(page, testInfo, '06-paciente-toby');

    await menu(page, 'Tutores');
    await page.getByRole('link', { name: new RegExp(TUTOR) }).click();
    await page.getByRole('link', { name: 'Agregar' }).click();
    await page.locator('#p-name').fill('Mora');
    await page.getByLabel('Especie', { exact: true }).selectOption({ label: 'Gato' });
    await page.getByRole('radio', { name: 'Hembra' }).click();
    await page.getByRole('radio', { name: 'Esterilizado/a' }).click();
    await page.getByLabel('Peso actual').fill('4,1');
    await page.getByRole('button', { name: 'Guardar paciente' }).click();
    await expectToast(page, 'Paciente registrado');
    await expect(page.getByRole('heading', { name: 'Mora' })).toBeVisible();
  });

  let apptUrl = '';
  await test.step('6. Agendar la visita para ambos', async () => {
    await menu(page, 'Tutores');
    await page.getByRole('link', { name: new RegExp(TUTOR) }).click();
    await expect(page.getByText('Mascotas (2)')).toBeVisible();
    await page.getByRole('link', { name: 'Agendar visita' }).click();
    await page.getByRole('checkbox', { name: /Toby/ }).check();
    await page.getByRole('checkbox', { name: /Mora/ }).check();
    await page.locator('input[type="date"]').first().fill(tomorrow);
    await page.locator('input[type="time"]').fill('10:00');
    await page.getByLabel('Duración estimada').fill('60');
    await page.getByLabel('Traslado previo').fill('25');
    await page.getByPlaceholder('Vacunación anual, control de otitis…').fill('Vacunación anual y control de oídos');
    await expect(page.getByLabel('Calle y número')).toHaveValue('Av. Apoquindo 4500, depto 1203');
    await page.getByRole('button', { name: 'Agendar', exact: true }).click();
    await expectToast(page, 'Visita agendada');
    apptUrl = page.url();
    await expect(page.getByRole('button', { name: 'Pendiente' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('a[href^="https://wa.me/56987654321"]').first()).toBeVisible();
    await expect(page.locator('a[href*="google.com/maps"]').first()).toBeVisible();
    await shot(page, testInfo, '07-visita');

    // Conflicto: otra visita a la misma hora muestra la superposición.
    await tab(page, 'Agenda');
    await page.goto(`./#/agenda?fecha=${tomorrow}&vista=dia`);
    await expect(page.getByText(/Toby/).first()).toBeVisible();
    await shot(page, testInfo, '08-agenda-dia');
    await page.getByRole('radio', { name: 'Semana' }).click();
    await expect(page.getByText(/Toby/).first()).toBeVisible();
    await shot(page, testInfo, '08-agenda-semana');
    await page.goto(`./#/agenda/nueva?fecha=${tomorrow}`);
    await page.locator('input[type="time"]').fill('10:30');
    await expect(page.getByText(/Se superpone con/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });

  let consultUrl = '';
  await test.step('7. Abrir el paciente y comenzar la consulta desde la visita', async () => {
    await page.goto(apptUrl);
    await page.getByRole('link', { name: /^Toby/ }).click();
    await expect(page.getByRole('heading', { name: 'Toby' })).toBeVisible();
    await expect(page.getByText(TUTOR).first()).toBeVisible();
    await page.goBack();
    await page.getByRole('button', { name: 'Iniciar consulta' }).click();
    await dialog(page, '¿A qué paciente atenderás?').getByRole('button', { name: /Toby/ }).click();
    await expect(page.getByRole('heading', { name: 'Toby' })).toBeVisible();
    consultUrl = page.url();
    expect(consultUrl).toMatch(/#\/consultas\//);
  });

  await test.step('8. Completar la consulta sin valores precargados', async () => {
    await page.getByLabel('Motivo principal').fill('Sacude la cabeza y se rasca la oreja derecha');
    await page.getByRole('button', { name: '3. Examen físico' }).click();
    // Nada se completa solo: peso y temperatura vacíos y ningún sistema marcado como normal.
    await expect(page.getByLabel('Peso', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Temperatura', { exact: true })).toHaveValue('');
    await expect(page.getByRole('radio', { name: 'Normal', checked: true })).toHaveCount(0);
    await page.getByLabel('Peso', { exact: true }).fill('12,6');
    await page.getByLabel('Temperatura', { exact: true }).fill('38,6');
    await page.getByRole('radiogroup', { name: 'Oídos' }).getByRole('radio', { name: 'Alterado' }).click();
    await page.getByLabel('Observación Oídos').fill('Eritema y secreción en conducto auditivo derecho');
    await page.getByRole('button', { name: '4. Evaluación clínica' }).click();
    await page.getByRole('button', { name: 'Agregar diagnóstico' }).click();
    await page.getByLabel('Diagnóstico 1').fill('Otitis externa');
    await shot(page, testInfo, '09-consulta-examen');
  });

  await test.step('9. Tratamiento con calculadora de dosis revisada', async () => {
    await page.getByRole('button', { name: '5. Plan de manejo' }).click();
    await page.getByRole('button', { name: 'Agregar tratamiento' }).click();
    await page.getByLabel('Tratamiento 1').fill(MED);
    await page.getByRole('button', { name: 'Calcular' }).click();
    const calc = dialog(page, 'Calculadora de dosis');
    await expect(calc.getByLabel('Origen del peso')).toContainText('12,6');
    await calc.getByLabel('Dosis indicada').fill('0,2');
    await calc.getByLabel('Unidad de dosis').selectOption('mg/kg');
    await calc.getByLabel('Concentración de la presentación').fill('5');
    // Unidades incompatibles: el cálculo se detiene.
    await calc.getByLabel('Unidad de concentración').selectOption('UI/mL');
    await expect(calc.getByText('Cálculo detenido')).toBeVisible();
    await calc.getByLabel('Unidad de concentración').selectOption('mg/mL');
    await calc.getByRole('radio', { name: '24 h' }).click();
    await calc.getByLabel('Duración').fill('5');
    await expect(calc.getByTestId('dose-result')).toContainText('0,504');
    await expect(calc.getByRole('button', { name: 'Usar en la indicación' })).toBeDisabled();
    await shot(page, testInfo, '10-calculadora');
    await calc.getByRole('checkbox').check();
    await calc.getByRole('button', { name: 'Usar en la indicación' }).click();
    await expectToast(page, 'Cálculo incorporado');
    await expect(page.locator('input[placeholder="Ej.: 1 comprimido"]')).toHaveValue(/0,504/);
    await page.getByRole('radio', { name: '+7 días' }).click();
  });

  await test.step('10. Registrar la vacuna desde la consulta', async () => {
    await page.getByRole('button', { name: /6\. Cierre/ }).click();
    await page.getByRole('link', { name: 'Vacuna', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Registrar vacuna' })).toBeVisible();
    await page.getByRole('combobox', { name: /^Vacuna/ }).fill('Antirrábica');
    await page.getByLabel('N.º de lote').fill('AR-2026-118');
    await page.getByLabel('Vencimiento del producto').fill(addDaysISO(today, 300));
    await page.getByLabel('Fecha de la próxima dosis').fill(addDaysISO(today, 365));
    await page.getByRole('button', { name: 'Registrar vacuna' }).click();
    await expectToast(page, 'Vacuna registrada');
    await expect(page).toHaveURL(consultUrl);
  });

  await test.step('11. Emitir la receta y generar y abrir el PDF', async () => {
    await page.getByRole('button', { name: /6\. Cierre/ }).click();
    await page.getByRole('link', { name: 'Receta', exact: true }).click();
    await expect(page.getByText('Medicamentos traídos del plan de la consulta')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Medicamento obligatorio' })).toHaveValue(MED);
    await page.getByLabel('Concentración', { exact: true }).fill('5 mg/mL');
    await page.getByRole('button', { name: 'Emitir receta' }).click();
    await expect(dialog(page, 'Emitir receta')).toContainText('Tu perfil no tiene RUT.');
    await dialog(page, 'Emitir receta').getByRole('button', { name: 'Emitir' }).click();
    await expectToast(page, 'Receta emitida');
    await page.getByRole('button', { name: 'Ver / compartir PDF' }).click();
    const ready = dialog(page, 'Documento listo');
    await expect(ready).toBeVisible();
    await shot(page, testInfo, '11-receta-pdf');
    const pdf = await clickAndDownload(page, ready.getByRole('button', { name: 'Descargar' }), testInfo);
    expect(pdf.name).toMatch(/^receta-Toby-\d{4}-\d{2}-\d{2}\.pdf$/);
    const doc = await readPdf(pdf.bytes);
    expect(doc.pages).toBe(1);
    for (const s of ['Receta médico veterinaria', VET_NAME, 'Toby', TUTOR, `${MED} 5 mg/mL`, '0,504', 'Cada 24 horas', 'Cálculo revisado por la profesional']) expect(doc.text).toContain(s);
    // "Abrir / imprimir" abre el PDF en una pestaña nueva.
    // (Chromium sin pantalla no dibuja PDF: se verifica que la pestaña se abre y que la app no pierde su pantalla).
    const before = page.url();
    const [popup] = await Promise.all([page.waitForEvent('popup'), ready.getByRole('button', { name: 'Abrir / imprimir' }).click()]);
    await page.waitForTimeout(500);
    expect(page.url()).toBe(before);
    await expect(page.getByText('No se pudo abrir una pestaña nueva')).toHaveCount(0);
    await popup.close();
    await ready.getByRole('button', { name: 'Cerrar' }).click();
  });

  await test.step('12. Cobro, abono y pago del saldo', async () => {
    await page.goto(consultUrl);
    await page.getByRole('button', { name: /6\. Cierre/ }).click();
    await page.getByRole('link', { name: 'Cobro', exact: true }).click();
    await expect(page.getByText('Paciente: Toby')).toBeVisible();
    await page.getByLabel('Descripción ítem 1').fill('Consulta a domicilio');
    await page.getByLabel('Precio unitario').first().fill('35000');
    await page.getByRole('button', { name: 'Agregar ítem' }).click();
    await page.getByLabel('Descripción ítem 2').fill('Vacuna antirrábica');
    await page.getByLabel('Tipo de ítem').nth(1).selectOption('medication');
    await page.getByLabel('Precio unitario').nth(1).fill('15000');
    await page.getByText('Registrar un pago ahora').click();
    await expect(page.getByRole('switch', { name: /Registrar un pago ahora/ })).toBeChecked();
    await page.getByLabel('Monto del pago').fill('20000');
    await page.getByLabel('Medio de pago').selectOption('transfer');
    await page.getByRole('button', { name: /Guardar cobro · \$50\.000/ }).click();
    await expectToast(page, 'Cobro registrado');
    await expect(page.getByText('$30.000').first()).toBeVisible();
    await page.getByRole('button', { name: 'Registrar pago o abono' }).click();
    const pay = dialog(page, 'Registrar pago');
    await pay.getByLabel('Monto').fill('30000');
    await pay.getByLabel('Medio de pago').selectOption('cash');
    await pay.getByRole('button', { name: 'Guardar pago' }).click();
    await expectToast(page, 'Pago registrado: cobro saldado');
    await expect(page.getByRole('button', { name: 'Registrar pago o abono' })).toHaveCount(0);
    await shot(page, testInfo, '12-cobro-pagado');
    await page.getByRole('button', { name: 'Comprobante interno (PDF)' }).click();
    const rec = await clickAndDownload(page, dialog(page, 'Documento listo').getByRole('button', { name: 'Descargar' }), testInfo);
    const recText = (await readPdf(rec.bytes)).text;
    expect(recText).toContain('NO VÁLIDO COMO BOLETA NI FACTURA');
    expect(recText).toContain('$50.000');
    await dialog(page, 'Documento listo').getByRole('button', { name: 'Cerrar' }).click();
  });

  await test.step('13. Finalizar la consulta y cerrar la visita', async () => {
    await page.goto(consultUrl);
    await page.getByRole('button', { name: 'Finalizar consulta' }).click();
    await dialog(page, 'Finalizar consulta').getByRole('button', { name: 'Finalizar' }).click();
    await expectToast(page, 'Consulta finalizada');
    await dialog(page, 'Visita').getByRole('button', { name: 'Sí, completada' }).click();
    await expect(page.getByText('Registros vinculados')).toBeVisible();
    await expect(page.getByRole('link', { name: `Receta: ${MED}` })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vacuna: Antirrábica' })).toBeVisible();
    await shot(page, testInfo, '13-consulta-finalizada');
  });

  await test.step('14. Enmienda con motivo, conservando la versión anterior', async () => {
    await page.getByRole('link', { name: 'Corregir / enmendar' }).click();
    await page.getByRole('button', { name: '3. Examen físico' }).click();
    await page.getByLabel('Peso', { exact: true }).fill('12,8');
    await page.getByRole('button', { name: 'Guardar corrección' }).click();
    const d = dialog(page, 'Guardar corrección');
    await d.getByLabel('Motivo de la corrección').fill('Peso mal digitado');
    await d.getByRole('button', { name: 'Guardar corrección' }).click();
    await expectToast(page, 'Corrección guardada');
    await expect(page.getByText(/Versión 1 \(reemplazada el/)).toBeVisible();
    await expect(page.getByText('Motivo: Peso mal digitado')).toBeVisible();
  });

  let page2: Page;
  await test.step('15. Cerrar y volver a abrir la app: se pide la contraseña', async () => {
    await page.close();
    page2 = await context.newPage();
    watch(page2);
    await page2.goto('./');
    await expect(page2.getByRole('heading', { name: 'Desbloquear' })).toBeVisible();
    await page2.getByLabel('Contraseña', { exact: true }).fill('contraseña equivocada');
    await page2.getByRole('button', { name: 'Desbloquear' }).click();
    await expect(page2.getByText(/incorrecta/i)).toBeVisible();
    await shot(page2, testInfo, '14-desbloquear');
    await unlock(page2);
    await expect(page2.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  });

  await test.step('16. Persistencia y asociaciones tras reabrir', async () => {
    const p = page2!;
    await tab(p, 'Pacientes');
    await expect(p.getByRole('link', { name: /^Toby Perro/ })).toBeVisible();
    await expect(p.getByRole('link', { name: /^Mora Gato/ })).toBeVisible();
    await p.getByRole('link', { name: /^Toby Perro/ }).click();
    await p.getByRole('tab', { name: 'Historial' }).click();
    await expect(p.getByText('Finalizada').first()).toBeVisible();
    await p.getByRole('tab', { name: 'Vacunas' }).click();
    await expect(p.getByText('Antirrábica').first()).toBeVisible();
    await p.getByRole('tab', { name: 'Recetas' }).click();
    await expect(p.getByText(MED).first()).toBeVisible();
    await p.getByRole('tab', { name: 'Peso' }).click();
    await expect(p.getByText('12,8').first()).toBeVisible();
    await shot(p, testInfo, '15-paciente-tras-reabrir');
    await menu(p, 'Tutores');
    await p.getByRole('link', { name: new RegExp(TUTOR) }).click();
    await expect(p.getByText('Mascotas (2)')).toBeVisible();
    await expect(p.getByText('Sin deuda')).toBeVisible();
    await tab(p, 'Inicio');
    await shot(p, testInfo, '16-inicio-con-datos');
  });

  await test.step('16b. Sugerencias por WhatsApp y búsqueda de actualizaciones', async () => {
    const p = page2!;
    await tab(p, 'Más');
    await p.getByRole('button', { name: /Sugerir un cambio o reportar un problema/ }).click();
    const fb = dialog(p, 'Sugerir un cambio o reportar un problema');
    await expect(fb.getByRole('button', { name: 'Escribe tu mensaje para enviarlo' })).toBeDisabled();
    await fb.getByLabel('¿Qué te gustaría cambiar o agregar?').fill('Que la agenda muestre los km del día');
    const href = (await fb.getByRole('link', { name: 'Enviar por WhatsApp' }).getAttribute('href'))!;
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    const msg = decodeURIComponent(href.slice('https://wa.me/?text='.length));
    expect(msg).toContain('Sugerencia');
    expect(msg).toContain('Que la agenda muestre los km del día');
    expect(msg).toMatch(/Versión \d+\.\d+\.\d+/);
    expect(msg).not.toContain(TUTOR);
    await shot(p, testInfo, '16b-sugerencia');
    await fb.getByRole('button', { name: 'Cerrar' }).click();
    await menu(p, /Acerca de la app/);
    await p.getByRole('button', { name: 'Buscar actualizaciones' }).click();
    await expectToast(p, 'Ya tienes la última versión.');
    await expect(p.getByText('Novedades por versión')).toBeVisible();
  });

  let backup: { name: string; file: string; bytes: Uint8Array } = { name: '', file: '', bytes: new Uint8Array() };
  await test.step('17. Respaldo cifrado, verificación y exportación abierta', async () => {
    const p = page2!;
    await menu(p, 'Respaldo, exportación y restauración');
    await p.getByRole('button', { name: 'Crear respaldo cifrado' }).click();
    const sheet = dialog(p, 'Respaldo listo');
    backup = await clickAndDownload(p, sheet.getByRole('button', { name: 'Guardar o compartir el archivo' }), testInfo);
    const slug = slugify(await p.title());
    expect(backup.name).toMatch(new RegExp(`^respaldo-${slug}-.+\\.${slug}$`));
    await sheet.getByRole('button', { name: 'Cerrar' }).click();
    const files = unzipSync(backup.bytes);
    const records = strFromU8(files['records.json']);
    for (const s of ['Toby', 'Mora', TUTOR, 'Otitis', MED, 'Apoquindo']) expect(records).not.toContain(s);

    // Verificar sin restaurar: contraseña equivocada y correcta.
    await p.getByRole('button', { name: 'Verificar un respaldo' }).click();
    const v = dialog(p, 'Verificar respaldo');
    await p.getByTestId('verify-file-input').setInputFiles(backup.file);
    await v.getByLabel('Contraseña del respaldo').fill('otra contraseña cualquiera');
    await v.getByRole('button', { name: 'Verificar', exact: true }).click();
    await expect(v.getByText(/incorrecta/i)).toBeVisible();
    await v.getByLabel('Contraseña del respaldo').fill(PASS);
    await v.getByRole('button', { name: 'Verificar', exact: true }).click();
    await expect(v.getByText('Respaldo verificado: se puede restaurar')).toBeVisible();
    await shot(p, testInfo, '17-respaldo-verificado');
    await v.getByRole('button', { name: 'Cerrar' }).click();

    // Exportación abierta: exige confirmar la contraseña y conserva las relaciones.
    await p.getByRole('button', { name: 'Exportar todos los datos (sin cifrar)' }).click();
    await dialog(p, 'Exportación abierta (sin cifrar)').getByRole('button', { name: 'Entiendo, continuar' }).click();
    await dialog(p, 'Confirma tu identidad').getByLabel('Contraseña').fill('no es mi contraseña');
    await dialog(p, 'Confirma tu identidad').getByRole('button', { name: 'Generar exportación' }).click();
    await expectToast(p, 'Contraseña incorrecta.');
    await p.getByRole('button', { name: 'Exportar todos los datos (sin cifrar)' }).click();
    await dialog(p, 'Exportación abierta (sin cifrar)').getByRole('button', { name: 'Entiendo, continuar' }).click();
    await dialog(p, 'Confirma tu identidad').getByLabel('Contraseña').fill(PASS);
    const exp = await clickAndDownload(p, dialog(p, 'Confirma tu identidad').getByRole('button', { name: 'Generar exportación' }), testInfo);
    expect(exp.name).toMatch(new RegExp(`^exportacion-abierta-${slug}-.+\\.zip$`));
    const z = unzipSync(exp.bytes);
    const json = <T,>(n: string) => JSON.parse(strFromU8(z[`datos/${n}.json`])) as T[];
    expect(Object.keys(z)).toContain('LEEME.txt');
    const tutors = json<{ id: string; fullName: string }>('tutors');
    const patients = json<{ id: string; name: string; tutors: Array<{ tutorId: string }> }>('patients');
    const consultations = json<{ id: string; patientId: string; status: string; version: number }>('consultations');
    const prescriptions = json<{ consultationId: string; patientId: string }>('prescriptions');
    const vaccinations = json<{ consultationId: string; lotNumber: string }>('vaccinations');
    const charges = json<{ id: string; consultationId: string }>('charges');
    const payments = json<{ chargeId: string; amountCLP: number }>('payments');
    const tutor = tutors.find((t) => t.fullName === TUTOR)!;
    expect(patients.map((x) => x.name).sort()).toEqual(['Mora', 'Toby']);
    expect(patients.every((x) => x.tutors[0].tutorId === tutor.id)).toBe(true);
    const toby = patients.find((x) => x.name === 'Toby')!;
    const cons = consultations.find((c) => c.patientId === toby.id)!;
    expect(cons.status).toBe('final');
    expect(cons.version).toBe(2);
    expect(prescriptions[0].consultationId).toBe(cons.id);
    expect(vaccinations[0].consultationId).toBe(cons.id);
    expect(vaccinations[0].lotNumber).toBe('AR-2026-118');
    expect(charges[0].consultationId).toBe(cons.id);
    expect(payments.filter((x) => x.chargeId === charges[0].id).reduce((a, x) => a + x.amountCLP, 0)).toBe(50000);
    expect(strFromU8(z['csv/pacientes.csv'])).toContain('Toby');
  });

  await test.step('18. Reglas de acceso: datos cifrados en el dispositivo, bloqueo y otro perfil sin acceso', async () => {
    const p = page2!;
    const raw = await rawIndexedDb(p);
    expect(raw.length).toBeGreaterThan(1000);
    for (const s of ['Toby', 'Mora', TUTOR, 'Otitis', MED, 'Apoquindo', VET_NAME, '98765']) expect(raw).not.toContain(s);

    await tab(p, 'Más');
    await p.getByRole('button', { name: 'Bloquear ahora' }).click();
    await expect(p.getByRole('heading', { name: 'Desbloquear' })).toBeVisible();
    await p.goto('./#/pacientes');
    await expect(p.getByRole('heading', { name: 'Desbloquear' })).toBeVisible();
    await expect(p.getByText('Toby')).toHaveCount(0);

    const other = await newPhoneContext(browser, testInfo);
    const op = await other.newPage();
    await op.goto('./#/pacientes');
    await expect(op.getByRole('button', { name: 'Crear mi cuenta' })).toBeVisible();
    await expect(op.getByText('Toby')).toHaveCount(0);
    await other.close();
    await unlock(p);
  });

  await test.step('19. Restaurar el respaldo en otro teléfono', async () => {
    const phone2 = await newPhoneContext(browser, testInfo);
    const q = await phone2.newPage();
    watch(q);
    await q.goto('./');
    await q.getByRole('button', { name: 'Restaurar desde un respaldo' }).click();
    await q.getByTestId('backup-file-input').setInputFiles(backup.file);
    await expect(q.getByText(/registros/).first()).toBeVisible();
    await q.getByLabel('Contraseña vigente al crear el respaldo').fill(PASS);
    await q.getByRole('button', { name: 'Restaurar', exact: true }).click();
    await expectToast(q, /Respaldo restaurado/);
    await expect(q.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    await tab(q, 'Pacientes');
    await q.getByRole('link', { name: /^Toby Perro/ }).click();
    await q.getByRole('tab', { name: 'Historial' }).click();
    await expect(q.getByText('Finalizada').first()).toBeVisible();
    await q.getByRole('tab', { name: 'Recetas' }).click();
    await expect(q.getByText(MED).first()).toBeVisible();
    await shot(q, testInfo, '18-restaurado-otro-telefono');
    await phone2.close();
  });

  await test.step('20. Sin conexión: la app abre, desbloquea y guarda', async () => {
    const p = page2!;
    const active = await p.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
    expect(active).toBe(true);
    await context.setOffline(true);
    await p.reload();
    await unlock(p);
    await expect(p.getByText('Sin conexión. Puedes seguir trabajando')).toBeVisible();
    await menu(p, 'Tareas de seguimiento');
    await expect(p.getByRole('heading', { name: /Tareas/ })).toBeVisible();
    await tab(p, 'Pacientes');
    await p.getByRole('link', { name: /^Mora Gato/ }).click();
    await p.getByRole('button', { name: 'Peso' }).click();
    const w = dialog(p, 'Registrar peso');
    await w.getByRole('textbox', { name: 'Peso obligatorio' }).fill('4,3');
    await w.getByRole('button', { name: 'Guardar peso' }).click();
    await p.getByRole('tab', { name: 'Peso' }).click();
    await expect(p.getByText('4,3').first()).toBeVisible();
    await shot(p, testInfo, '19-sin-conexion');
    await p.reload();
    await unlock(p);
    await tab(p, 'Pacientes');
    await p.getByRole('link', { name: /^Mora Gato/ }).click();
    await p.getByRole('tab', { name: 'Peso' }).click();
    await expect(p.getByText('4,3').first()).toBeVisible();
    await context.setOffline(false);
  });

  expect(pageErrors, `Errores de JavaScript en la página:\n${pageErrors.join('\n')}`).toEqual([]);
});

test('la app se puede instalar: manifiesto e iconos para iPhone', async ({ page, request }) => {
  await page.goto('./');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const m = await (await request.get(new URL(manifestHref!, page.url()).toString())).json();
  expect(m.display).toBe('standalone');
  expect(m.lang).toBe('es-CL');
  expect(m.name).toBeTruthy();
  expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(new URL(touch!, page.url()).toString())).ok()).toBe(true);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]').first()).toHaveCount(1);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
});
