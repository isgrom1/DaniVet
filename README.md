# DApp

Aplicación web instalable (PWA) para una médica veterinaria independiente que atiende a domicilio en Chile. Se usa desde el iPhone (Safari → "Agregar a inicio"), funciona sin conexión y guarda los datos **cifrados en el propio teléfono**. No requiere servidores, bases de datos ni instalación de programas.

> **Publicada y verificada: https://isgrom1.github.io/DaniVet/**
> El 11-10-2026 el flujo "Pruebas y publicación" ([ejecución n.º 3](https://github.com/isgrom1/DaniVet/actions/runs/38177804095)) la publicó en GitHub Pages y luego, desde los servidores de GitHub,
> comprobó que responde por HTTPS y ejecutó el flujo de aceptación completo contra esa URL en tres tamaños de iPhone (6 de 6 aprobadas).
> Cada cambio de código en la rama principal se vuelve a probar, publicar y verificar automáticamente.

## Documentación

Para pedir cambios: `CLAUDE.md` describe cómo se implementa, prueba y publica cada pedido.

| Documento | Para quién | Contenido |
| --- | --- | --- |
| [Guía de uso](docs/guia-usuaria.md) | La veterinaria | Instalar en el iPhone, crear la cuenta, uso diario, PIN, respaldos |
| [Mensaje para WhatsApp](docs/mensaje-whatsapp.md) | Quien comparte el enlace | Texto listo para enviar con el enlace e instrucciones |
| [Respaldo y recuperación](docs/respaldo-y-recuperacion.md) | Ambos | Cómo respaldar, verificar y restaurar; qué hacer si se pierde el teléfono o la contraseña |
| [Documentación técnica](docs/tecnico.md) | Mantención | Arquitectura, estructura del código, esquema de datos, migraciones, seguridad, publicación y mantención |
| [Resultados de las pruebas](docs/pruebas.md) | Revisión | Qué se probó, cómo y con qué resultado (y qué no se pudo probar) |
| [Limitaciones, costos y aspectos legales](docs/limitaciones-costos-y-legal.md) | Decisión | Limitaciones conocidas, costos actuales y futuros, normativa chilena relevante |

## Funciones implementadas

- **Cuenta local cifrada**: contraseña + clave de recuperación (se muestra una sola vez), PIN opcional de desbloqueo rápido, bloqueo automático por inactividad y al pasar a segundo plano.
- **Inicio**: visitas del día, controles y tratamientos próximos, vacunas y desparasitaciones por vencer, exámenes por revisar, tareas, aviso de respaldo pendiente. Configurable.
- **Tutores**: varias direcciones con indicaciones de acceso, contacto alternativo y persona autorizada para decidir, detección de posibles duplicados **sin fusión automática** (la fusión es manual y explícita), anonimización.
- **Pacientes**: campos según la especie, foto, microchip, edad por fecha o estimada, historial de peso con gráfico, antecedentes, alergias y alertas clínicas visibles en la ficha, la agenda y la consulta.
- **Agenda**: vista día y semana, estados (pendiente, confirmada, en camino, en atención, completada, cancelada), detección de superposición y de tiempo de traslado insuficiente, horario laboral, enlaces a Apple Maps, Google Maps y Waze, llamada y WhatsApp (con mensaje de recordatorio), exportación al Calendario (.ics).
- **Dictado de la consulta** con el micrófono del teclado del iPhone: la app interpreta el texto en el teléfono y propone dónde va cada dato (motivo, signos vitales, sistemas, diagnóstico, tratamiento, control); la profesional elige qué agregar y lo dictado queda marcado para revisar. Aviso de **datos importantes sin registrar**.
- **Valores de exámenes y su evolución**: hemograma, bioquímica, electrolitos, orina y endocrino (escritos o dictados) con el rango que informa el laboratorio; tabla comparativa con filtros y gráfico por valor en la ficha del paciente.
- **Consultas**: borrador con guardado automático, secciones (motivo, anamnesis, examen físico por sistemas, evaluación, plan, cierre), **ningún valor normal se completa solo**, copiar de una consulta anterior o usar plantillas (los campos copiados quedan marcados y deben revisarse; examen, diagnóstico y tratamiento no se copian), finalización con bloqueo, **enmiendas con motivo que conservan la versión anterior**, controles de seguimiento, tareas, adjuntos, informe clínico e indicaciones al tutor en PDF.
- **Recetas**: desde la consulta o la ficha, **calculadora de dosis con verificación de unidades** (no sugiere dosis; se detiene si faltan datos o las unidades no son compatibles y exige confirmar la revisión), avisos de antimicrobianos (receta electrónica del SAG) y productos controlados (receta retenida), emisión bloqueada, anulación con motivo, PDF.
- **Vacunas y desparasitaciones**: vencimiento del producto separado de la fecha de la próxima dosis, lote, pautas configurables, certificado de vacunación en PDF.
- **Exámenes y documentos**: solicitudes y resultados con adjuntos; consentimientos, rechazo de tratamiento y otros documentos con firma dibujada (no es firma electrónica avanzada) y PDF.
- **Finanzas**: servicios y precios, cobros con ítems (honorarios, medicamentos, insumos, traslado), abonos y pagos, gastos con kilometraje, presupuestos convertibles en cobro, reportes por período, exportación CSV, comprobante interno en PDF (**no es boleta ni factura**).
- **Inventario (opcional)**: productos, lotes con vencimiento, movimientos y descuento desde vacunas.
- **Búsqueda global**, **historial de cambios cifrado**, **recordatorios dentro de la app**.
- **Actualización automática** (se instala sola cuando la app está bloqueada; muestra las novedades) y **Sugerir un cambio o reportar un problema** por WhatsApp o correo, con la versión incluida.
- **Respaldo cifrado (.dapp)**, verificación de un respaldo sin restaurarlo, restauración (con contraseña o clave de recuperación), **exportación abierta** (JSON con relaciones, CSV y adjuntos; exige confirmar la contraseña) y PDF de la ficha de un paciente.
- **Modo sin conexión** completo, **datos de demostración** marcados "(DEMO)" que se cargan y eliminan desde Ajustes, perfil profesional (logo y firma para documentos) y personalización (nombre de la app, especies, rangos de referencia, medicamentos frecuentes, plantillas, medios de pago).

## Resultados de las pruebas (ejecutadas realmente)

- **Unitarias (Vitest):** 69 de 69 aprobadas en 10 archivos: cifrado y bóveda, integridad referencial, conflictos, consultas y enmiendas, calculadora de dosis, finanzas, recordatorios, duplicados, agenda, respaldo/restauración/manipulación, PDF con extracción de texto, migraciones de datos, novedades por versión, mensajes de sugerencia, dictado de la consulta y valores de exámenes con su evolución.
- **Extremo a extremo (Playwright, Chromium emulando iPhone SE, iPhone 15 y iPhone 15 Pro Max):** 6 de 6 aprobadas, en `/` y también bajo la ruta `/DaniVet/` que usará GitHub Pages. El flujo de aceptación tiene 21 pasos: cuenta → tutor → dos animales → visita → consulta → tratamiento → vacuna → receta PDF → cobro y pago → cerrar y reabrir → persistencia → enmienda → sugerencias y búsqueda de actualizaciones → respaldo y exportación → reglas de acceso → restauración en otro teléfono → sin conexión.
- **Dictado y valores de exámenes** (`e2e/voice-labs.spec.ts`, versión 1.2.0): dictado de una consulta completa con revisión de cada dato, aviso de datos faltantes, dos exámenes con rangos del laboratorio (uno dictado) y la tabla de evolución con filtros y gráfico, en los tres iPhone.
- **Actualización real de la app instalada** (`e2e/update.spec.ts`): una versión nueva se instala sola con la app bloqueada, avisa sin interrumpir mientras se usa, conserva los datos y muestra las novedades una vez.
- **En GitHub Actions** (servidores de GitHub): tipos, unitarias, compilación y las 6 pruebas E2E aprobadas ([ejecución n.º 1](https://github.com/isgrom1/DaniVet/actions/runs/38176565733)). Cada cambio vuelve a ejecutarlas.
- **Contra la URL publicada** (https://isgrom1.github.io/DaniVet/, desde Internet): 6 de 6 aprobadas en 1,9 min ([ejecución n.º 3](https://github.com/isgrom1/DaniVet/actions/runs/38177804095)).
- **No probado en un iPhone real** (no hay Safari/WebKit en este entorno). Detalle en [docs/pruebas.md](docs/pruebas.md).

## Próximos pasos

Ya están hechos: repositorio público, GitHub Pages con *Source: GitHub Actions*, publicación y verificación de la URL.

1. Enviar el enlace a la veterinaria con el [mensaje para WhatsApp](docs/mensaje-whatsapp.md).
2. Pedirle que confirme en su iPhone: instalación con "Agregar a inicio", creación de la cuenta, compartir un PDF por WhatsApp y guardar un respaldo en iCloud Drive (es la única parte que no se pudo probar en un iPhone real).
3. No hace falta tocar los flujos sugeridos que muestra *Settings → Pages* ("Configure" de Jekyll o Static HTML): la publicación ya la hace `.github/workflows/publicar.yml`.

## Desarrollo

Requisitos: Node.js 20.19 o superior.

```bash
npm ci               # instalar dependencias
npm run dev          # servidor de desarrollo
npm run typecheck    # tipos
npm test             # pruebas unitarias
npm run build        # compilación de producción (dist/)
npm run test:e2e     # pruebas de extremo a extremo (usa npm run preview)
```

El nombre de la app ("DApp") se cambia en una sola línea de `vite.config.ts` (`APP_NAME`) o con `VITE_APP_NAME=MiNombre npm run build`. Ver [Cambiar el nombre](docs/tecnico.md#cambiar-el-nombre-de-la-app). El proyecto se llamó VetCasa al comienzo; algunos identificadores internos conservan ese nombre a propósito.
