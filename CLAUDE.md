# DApp: guía para trabajar en este repositorio

App web instalable (PWA) para médicas y médicos veterinarios que atienden a domicilio en Chile, pensada para iPhone.
Todo funciona en el dispositivo, cifrado, sin servidor. Publicada en **https://isgrom1.github.io/DaniVet/** (GitHub Pages).
Documentación completa en `docs/` (técnica: `docs/tecnico.md`).

## Cómo se pide y se publica un cambio

Isaac (dueño del repositorio) pide los cambios en lenguaje natural. A veces reenvía sugerencias que llegan desde la app
(*Más › Sugerir un cambio o reportar un problema*, por WhatsApp o correo, con la versión incluida). Para cada pedido:

1. Trabajar en la rama `claude/hopeful-faraday-muq85h`: es la rama principal del repositorio; hacer push a ella publica.
2. Implementar respetando las reglas de abajo. Si el pedido es ambiguo o afecta datos clínicos, preguntar antes.
3. Si el cambio es visible para quien usa la app: subir la versión (`npm version patch` o `minor --no-git-tag-version`) y
   agregar **arriba** en `src/changelog.ts` una entrada con frases cortas, en español y sin tecnicismos. La app la muestra
   una vez como "se actualizó". Una prueba exige que la primera entrada coincida con la versión de `package.json`.
4. Verificar: `npm run typecheck && npm test && npm run build && npm run test:e2e`.
5. Commit en español y push. El flujo **Pruebas y publicación** (`.github/workflows/publicar.yml`) prueba, publica y
   ejecuta el flujo de aceptación contra la URL real. Confirmar que sus 4 trabajos terminen en verde antes de decir que está publicado.
6. Cada app instalada se actualiza sola (ver "Actualizaciones"). Avisar a Isaac qué cambió y qué debe revisar en el iPhone.

Los cambios que solo tocan documentación (`docs/`, `*.md`) no vuelven a publicar la app.
Para deshacer una versión: `git revert` del commit, subir la versión (la app compara versiones crecientes) con una entrada
"Se deshizo…" en `src/changelog.ts`, y push.

## Reglas que no se rompen

- **Clínica:** nunca completar valores normales por defecto; nunca copiar examen, diagnóstico ni tratamiento entre consultas;
  la calculadora calcula y verifica unidades pero **no sugiere dosis**; una consulta finalizada solo cambia por enmienda con
  motivo (la versión anterior se conserva); los recordatorios solo usan fechas registradas.
- **Seguridad y privacidad:** sin claves, tokens ni contraseñas en el código; sin scripts, fuentes ni servicios externos
  (CSP `default-src 'self'` en `vite.config.ts`); sin datos clínicos en notificaciones ni en mensajes que salen de la app;
  la exportación abierta exige contraseña.
- **Única excepción externa (autorizada por Isaac el 18-10-2026):** la lectura opcional de informes con IA conecta con
  `api.anthropic.com` (`connect-src` de la CSP). Viene desactivada; usa la clave propia de cada profesional, guardada cifrada
  en el teléfono y fuera de respaldos y exportaciones; envía solo la foto o el PDF elegido y solo al tocar «Leer con IA»;
  la IA solo transcribe y la profesional revisa antes de agregar. No ampliarla a otros datos o servicios sin autorización.
- **Identificadores internos `vetcasa`** (base IndexedDB `vetcasa`, prefijos de cifrado `vetcasa:…`, formato
  `vetcasa-backup`, canal `vetcasa-data`): **no cambiarlos**, dejarían ilegibles los datos y respaldos existentes.
  El nombre visible sale de `APP_NAME` en `vite.config.ts`.
- **Forma de los datos:** si cambia un esquema de forma incompatible, subir `DATA_VERSION` y agregar la migración en
  `src/data/migrations.ts`, con su prueba. Los campos opcionales nuevos no la necesitan.
- **Interfaz:** español de Chile y tuteo; pensada para iPhone (botones de al menos 44 px, funciona sin conexión);
  cada campo con etiqueta asociada (las pruebas E2E la usan).
- **Pruebas E2E:** rutas relativas (`./`, `./#/…`) para que funcionen en `/` y bajo `/DaniVet/`.
- **Sin autorización explícita de Isaac:** no integrar pagos, no contratar servicios y no cambiar la visibilidad del repositorio.

## Mapa rápido del código

- `src/data/`: modelo (`schema.ts`), relaciones, repositorio cifrado (`repo.ts`), sesión y bóveda, migraciones.
- `src/features/<módulo>/`: pantallas (agenda, consultations, prescriptions, preventive, finance, backup, settings, more…).
- `src/features/voice/`: dictado (interpreta el texto que escribe el micrófono del teclado; consulta y valores de exámenes).
- `src/features/exams/`: exámenes, catálogo de valores sin rangos propios (`analytes.ts`), evolución (`trends.ts`, `LabTrends.tsx`, `LabChart.tsx`).
- `src/features/ai/`: lectura opcional de informes con IA (clave cifrada `aiKey.ts`, envío a Claude `labReader.ts`, panel `AiReportPanel.tsx`);
  activación en `src/features/settings/AiSettings.tsx`.
- `src/lib/`: cifrado, IndexedDB, fechas, RUT, teléfonos, compartir archivos, service worker (`sw.ts`), formato simple de las
  indicaciones (`richText.ts`: subtítulos, negritas, viñetas y tablas; barra en `src/components/RichText.tsx`).
- `src/pdf/`: documentos PDF (pdf-lib, se carga solo al generar).
- `src/changelog.ts`: novedades por versión.
- `e2e/acceptance.spec.ts`: flujo de aceptación completo en tres tamaños de iPhone emulados; `e2e/voice-labs.spec.ts`: dictado y valores de exámenes; `e2e/ai-reader.spec.ts`: lectura con IA (API de Anthropic simulada); `e2e/indications.spec.ts`: indicaciones con formato y para
  varios pacientes del mismo tutor.

## Actualizaciones (cómo llegan a cada teléfono)

`src/lib/sw.ts`: la app busca versión nueva al abrirse, al volver a primer plano (máximo cada 10 min) y cada hora.
Si la app está bloqueada la instala de inmediato. Si está en uso, muestra el aviso "Actualizar ahora" y, si nadie lo
toca, la instala al bloquearse, después de guardar lo abierto. Al desbloquear se muestran las novedades
(`src/features/more/WhatsNew.tsx`). En iOS el nombre bajo el ícono no cambia con una actualización.

## Versiones publicadas

- 1.3.0: lectura opcional de informes con IA, con la clave propia de cada profesional (ejecución n.º 9, 21-10-2026).
- 1.2.1: pegado de informes con unidades y rangos (ejecución n.º 8, 18-10-2026).
- 1.2.0: dictado de la consulta, aviso de datos faltantes, valores de exámenes y su evolución (ejecución n.º 7, 18-10-2026).
- 1.1.0: actualización automática, novedades y botón de sugerencias.
- 1.0.0: commit `8322791`, primera versión publicada y verificada (11-10-2026).
