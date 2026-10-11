// Genera los íconos PNG de la PWA a partir del SVG original usando Chromium (Playwright).
// Uso: npm run icons
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { iconSvg } from './icon-source.mjs';

const out = new URL('../public/', import.meta.url);
mkdirSync(new URL('icons/', out), { recursive: true });

writeFileSync(new URL('favicon.svg', out), iconSvg({ rounded: true }));

const targets = [
  { file: 'icons/icon-192.png', size: 192, opts: {} },
  { file: 'icons/icon-512.png', size: 512, opts: {} },
  { file: 'icons/icon-maskable-512.png', size: 512, opts: { scale: 0.78 } },
  { file: 'apple-touch-icon.png', size: 180, opts: {} },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const svg = iconSvg(t.opts).replace('width="512" height="512"', `width="${t.size}" height="${t.size}"`);
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: t.size, height: t.size } });
  writeFileSync(new URL(t.file, out), png);
  console.log('generado', t.file);
}
await browser.close();
