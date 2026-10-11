# VetCasa

Aplicación web instalable (PWA) para una médica veterinaria independiente que atiende a domicilio en Chile. Se usa desde el iPhone (Safari → "Agregar a inicio"), funciona sin conexión y guarda los datos **cifrados en el propio teléfono**. No requiere servidores, bases de datos ni instalación de programas.

> **Estado de la publicación:** el código, las pruebas y el flujo de publicación automática están listos. La URL pública será
> **https://isgrom1.github.io/DaniVet/**, pero **todavía no está activa**: falta que la persona dueña del repositorio active GitHub Pages
> (ver [Acciones pendientes](#acciones-pendientes-que-solo-puede-hacer-la-persona-dueña-del-repositorio)). No compartas el enlace hasta que el flujo
> "Pruebas y publicación" termine en verde con el paso **Verificar la URL publicada desde Internet**.

## Documentación

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
- **Consultas**: borrador con guardado automático, secciones (motivo, anamnesis, examen físico por sistemas, evaluación, plan, cierre), **ningún valor normal se completa solo**, copiar de una consulta anterior o usar plantillas (los campos copiados quedan marcados y deben revisarse; examen, diagnóstico y tratamiento no se copian), finalización con bloqueo, **enmiendas con motivo que conservan la versión anterior**, controles de seguimiento, tareas, adjuntos, informe clínico e indicaciones al tutor en PDF.
- **Recetas**: desde la consulta o la ficha, **calculadora de dosis con verificación de unidades** (no sugiere dosis; se detiene si faltan datos o las unidades no son compatibles y exige confirmar la revisión), avisos de antimicrobianos (receta electrónica del SAG) y productos controlados (receta retenida), emisión bloqueada, anulación con motivo, PDF.
- **Vacunas y desparasitaciones**: vencimiento del producto separado de la fecha de la próxima dosis, lote, pautas configurables, certificado de vacunación en PDF.
- **Exámenes y documentos**: solicitudes y resultados con adjuntos; consentimientos, rechazo de tratamiento y otros documentos con firma dibujada (no es firma electrónica avanzada) y PDF.
- **Finanzas**: servicios y precios, cobros con ítems (honorarios, medicamentos, insumos, traslado), abonos y pagos, gastos con kilometraje, presupuestos convertibles en cobro, reportes por período, exportación CSV, comprobante interno en PDF (**no es boleta ni factura**).
- **Inventario (opcional)**: productos, lotes con vencimiento, movimientos y descuento desde vacunas.
- **Búsqueda global**, **historial de cambios cifrado**, **recordatorios dentro de la app**.
- **Respaldo cifrado (.vetcasa)**, verificación de un respaldo sin restaurarlo, restauración (con contraseña o clave de recuperación), **exportación abierta** (JSON con relaciones, CSV y adjuntos; exige confirmar la contraseña) y PDF de la ficha de un paciente.
- **Modo sin conexión** completo, **datos de demostración** marcados "(DEMO)" que se cargan y eliminan desde Ajustes, perfil profesional (logo y firma para documentos) y personalización (nombre de la app, especies, rangos de referencia, medicamentos frecuentes, plantillas, medios de pago).

## Resultados de las pruebas (ejecutadas realmente)

- **Unitarias (Vitest):** 42 de 42 aprobadas en 7 archivos: cifrado y bóveda, integridad referencial, conflictos, consultas y enmiendas, calculadora de dosis, finanzas, recordatorios, duplicados, agenda, respaldo/restauración/manipulación, PDF con extracción de texto y migraciones de datos.
- **Extremo a extremo (Playwright, Chromium emulando iPhone SE, iPhone 15 y iPhone 15 Pro Max):** 6 de 6 aprobadas, en `/` y también bajo la ruta `/DaniVet/` que usará GitHub Pages. El flujo de aceptación tiene 20 pasos: cuenta → tutor → dos animales → visita → consulta → tratamiento → vacuna → receta PDF → cobro y pago → cerrar y reabrir → persistencia → enmienda → respaldo y exportación → reglas de acceso → restauración en otro teléfono → sin conexión.
- **En GitHub Actions** (servidores de GitHub): tipos, unitarias, compilación y las 6 pruebas E2E aprobadas ([ejecución n.º 1](https://github.com/isgrom1/DaniVet/actions/runs/38176565733)). Cada cambio vuelve a ejecutarlas.
- **No probado en un iPhone real** (no hay Safari/WebKit en este entorno). Detalle en [docs/pruebas.md](docs/pruebas.md).

## Acciones pendientes que solo puede hacer la persona dueña del repositorio

1. **Permitir GitHub Pages en este repositorio.** Con el plan gratuito de GitHub, Pages solo funciona en repositorios **públicos**:
   *Settings → General → Danger Zone → Change repository visibility → Make public*.
   Se publica el **código** (no contiene datos de pacientes, claves ni contraseñas). Si prefieres mantener el código privado, se necesita un plan pago de GitHub: no lo contraté.
2. **Activar Pages con GitHub Actions:** *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
3. Volver a ejecutar el flujo **Pruebas y publicación** (pestaña *Actions → Pruebas y publicación → Run workflow*), o avisarme para hacerlo. Cuando termine en verde, la URL quedará verificada desde Internet.
4. Enviar el enlace a la veterinaria con el [mensaje para WhatsApp](docs/mensaje-whatsapp.md) y pedirle que pruebe en su iPhone.

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

El nombre de la app se cambia con `VITE_APP_NAME=MiNombre npm run build` (y dentro de la app en *Ajustes › Perfil profesional*). Más detalles en la [documentación técnica](docs/tecnico.md).
