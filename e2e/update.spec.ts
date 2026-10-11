import { expect, test, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { createAccount, dialog, expectToast, menu, tab, unlock } from './support';

/**
 * Actualización real de la app instalada: se compila una versión nueva mientras la app está abierta y se comprueba
 * que (1) con la app bloqueada se instala sola y (2) en uso aparece el aviso y se instala al bloquear, sin perder datos.
 * Recompila `dist/`, así que solo corre con E2E_UPDATE=1 contra el servidor local, en un tamaño de iPhone.
 */
test.skip(!process.env.E2E_UPDATE || !!process.env.E2E_BASE_URL, 'Solo con E2E_UPDATE=1 y servidor local');

const bundle = (page: Page) => page.locator('script[type="module"][src*="assets/index-"]').getAttribute('src');

function rebuild() {
  execSync('npx vite build', { stdio: 'pipe', env: { ...process.env, BASE_PATH: '/' } });
}

test('la app instalada se actualiza sola sin perder datos', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-15', 'Basta un tamaño');
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await createAccount(page);
  await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
  // Un dato para comprobar que sobrevive a las actualizaciones.
  await menu(page, 'Tutores');
  await page.getByRole('link', { name: 'Nuevo' }).click();
  await page.locator('#t-name').fill('Tutora Actualización');
  await page.locator('#t-phone').fill('9 1111 2222');
  await page.getByRole('button', { name: 'Guardar tutor' }).click();
  await expectToast(page, 'Tutor registrado');
  const v1 = await bundle(page);

  await test.step('con la app bloqueada, la versión nueva se instala sola al abrirla', async () => {
    await tab(page, 'Más');
    await page.getByRole('button', { name: 'Bloquear ahora' }).click();
    await expect(page.getByRole('heading', { name: 'Desbloquear' })).toBeVisible();
    rebuild();
    await page.reload(); // como volver a abrir la app desde el ícono
    // La página la sirve la app instalada (service worker), con la versión anterior guardada: el cambio solo puede venir de la actualización.
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect.poll(() => bundle(page), { timeout: 60_000 }).not.toBe(v1);
    await unlock(page);
    await menu(page, 'Tutores');
    await expect(page.getByRole('link', { name: /Tutora Actualización/ })).toBeVisible();
  });

  await test.step('en uso: aparece el aviso y la versión se instala al bloquear', async () => {
    const v2 = await bundle(page);
    rebuild();
    await menu(page, /Acerca de la app/);
    await page.getByRole('button', { name: 'Buscar actualizaciones' }).click();
    await expect(page.getByText('Hay una versión nueva. Se instala sola al bloquear la app.')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Instalar la versión nueva ahora' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actualizar ahora' })).toBeVisible();
    expect(await bundle(page)).toBe(v2); // no se interrumpe mientras se usa
    await tab(page, 'Más');
    await page.getByRole('button', { name: 'Bloquear ahora' }).click();
    await expect.poll(() => bundle(page), { timeout: 60_000 }).not.toBe(v2);
    await unlock(page);
    await expect(dialog(page, /se actualizó/)).toHaveCount(0); // misma versión: sin novedades que mostrar
    await menu(page, 'Tutores');
    await expect(page.getByRole('link', { name: /Tutora Actualización/ })).toBeVisible();
  });

  await test.step('después de actualizar se muestran las novedades una sola vez', async () => {
    // Simula que el teléfono tenía la versión 1.0.0.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const r = indexedDB.open('vetcasa');
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const tx = r.result.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({ key: 'lastSeenVersion', value: '1.0.0' });
            tx.oncomplete = () => {
              r.result.close();
              resolve();
            };
          };
        }),
    );
    await page.reload();
    await unlock(page);
    const news = dialog(page, /se actualizó/);
    await expect(news).toBeVisible();
    await expect(news).toContainText('La app se actualiza sola');
    await news.getByRole('button', { name: 'Entendido' }).click();
    await page.reload();
    await unlock(page);
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    await expect(dialog(page, /se actualizó/)).toHaveCount(0);
  });

  expect(errors).toEqual([]);
});
