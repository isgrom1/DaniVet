import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo con emulación de iPhone (viewport, densidad, táctil y user agent de iOS).
 * En este entorno solo está disponible Chromium; WebKit (Safari) no se puede ejecutar aquí, por lo que
 * la compatibilidad con Safari real debe confirmarse en un iPhone.
 */
const iphone = (name: string) => {
  const { defaultBrowserType: _ignored, ...d } = devices[name];
  void _ignored;
  return { ...d, browserName: 'chromium' as const };
};

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results',
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: 'iphone-se-3', use: iphone('iPhone SE (3rd gen)') },
    { name: 'iphone-15', use: iphone('iPhone 15') },
    { name: 'iphone-15-pro-max', use: iphone('iPhone 15 Pro Max') },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run preview', url: baseURL, reuseExistingServer: true, timeout: 60_000 },
});
