/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Nombre visible de la app: pantalla de inicio, título, textos, PDF y nombres de archivo.
// Para cambiarlo, edita este valor (o define VITE_APP_NAME al compilar) y publica.
// Los identificadores internos ("vetcasa" en la base de datos, el cifrado y el formato de respaldo) no cambian.
const APP_NAME = process.env.VITE_APP_NAME || 'DApp';
// Ruta base del sitio. En GitHub Pages (sitio de proyecto) es "/<repositorio>/".
const BASE_PATH = process.env.BASE_PATH || '/';

/**
 * Política de seguridad de contenidos (CSP) aplicada solo a la compilación de producción.
 * La app no realiza solicitudes a servidores externos: todo se procesa en el dispositivo. Única excepción opcional:
 * la lectura de fotos o PDF de informes con Claude (api.anthropic.com), que solo funciona si la profesional la activa
 * con su propia clave.
 */
/** Reemplaza %APP_NAME% en index.html (título y nombre para la pantalla de inicio del iPhone). */
function appNameInHtml(): Plugin {
  const escaped = APP_NAME.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return { name: 'app-name', transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', escaped) };
}

function contentSecurityPolicy(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // Única conexión externa: la lectura opcional de informes con Claude (desactivada hasta que la profesional
    // ingresa su propia clave; autorizada por Isaac el 18-10-2026).
    "connect-src 'self' blob: data: https://api.anthropic.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'vetcasa-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig({
  base: BASE_PATH,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __APP_NAME__: JSON.stringify(APP_NAME),
  },
  plugins: [
    react(),
    tailwindcss(),
    appNameInHtml(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        id: './',
        name: APP_NAME,
        short_name: APP_NAME,
        description: 'Gestión clínica para atención veterinaria a domicilio. Datos cifrados en el dispositivo.',
        lang: 'es-CL',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f4ef',
        theme_color: '#1f5f57',
        categories: ['medical', 'productivity', 'business'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: ['safari16', 'es2022'],
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 30000,
  },
});
