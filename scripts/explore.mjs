// Exploración visual rápida: abre la app, crea una cuenta y toma capturas en tamaño iPhone.
// Uso: node scripts/explore.mjs <url> <carpeta_salida>
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'e2e/.artifacts/explore';
mkdirSync(out, { recursive: true });
const { defaultBrowserType, ...dev } = devices['iPhone 15'];
void defaultBrowserType;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...dev, locale: 'es-CL', timezoneId: 'America/Santiago' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
const shot = async (name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });

await page.goto(url);
await page.waitForTimeout(800);
await shot('01-bienvenida');
await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
await page.getByLabel('Nombre completo').fill('Daniela Prueba');
await page.locator('#pass').fill('gato verde salta tres veces');
await page.locator('#pass2').fill('gato verde salta tres veces');
await page.getByRole('checkbox').check();
await shot('02-crear-cuenta');
await page.getByRole('button', { name: 'Crear cuenta' }).click();
await page.getByTestId('recovery-key').waitFor();
await shot('03-clave-recuperacion');
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'Continuar' }).click();
await page.getByRole('button', { name: 'Ahora no' }).click();
await page.getByRole('button', { name: 'Comenzar a usar VetCasa' }).click();
await page.waitForTimeout(500);
await shot('04-inicio-vacio');
await page.goto(`${url}#/ajustes/demo`);
await page.getByRole('button', { name: 'Cargar datos de demostración' }).click();
await page.waitForTimeout(800);
for (const [name, hash] of [
  ['05-inicio-demo', '/'],
  ['06-agenda', '/agenda'],
  ['07-pacientes', '/pacientes'],
  ['08-consulta-nueva', '/consulta'],
  ['09-mas', '/mas'],
  ['10-finanzas', '/finanzas'],
  ['11-preventivo', '/preventivo'],
]) {
  await page.goto(`${url}#${hash}`);
  await page.waitForTimeout(600);
  await shot(name);
}
// Ficha de paciente
await page.goto(`${url}#/pacientes`);
await page.getByText('Luna (DEMO)').first().click();
await page.waitForTimeout(600);
await shot('12-ficha-paciente');
console.log(JSON.stringify({ errors }, null, 1));
await browser.close();
