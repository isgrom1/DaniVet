# Resultados de las pruebas

Ejecutadas el 11 de octubre de 2026 (versiones 1.0.0 y 1.1.0), el 18 de octubre de 2026 (versiones 1.2.0 y 1.2.1) y el 21 de octubre de 2026 (versión 1.3.0) sobre el código de esta rama. Todas las cifras corresponden a ejecuciones reales.

## Resumen

| Prueba | Resultado |
| --- | --- |
| Tipos (TypeScript estricto) | Sin errores |
| Unitarias (Vitest, 8 archivos) | **47 / 47 aprobadas** |
| Compilación de producción | Correcta. JS principal 269 KB comprimido; generador de PDF 186 KB, se carga solo al crear un PDF; 1,4 MB guardados para uso sin conexión |
| Dependencias (`npm audit`) | 0 vulnerabilidades |
| Extremo a extremo (Playwright) en `/` | **6 / 6 aprobadas** (2 min 5 s) |
| Extremo a extremo bajo `/DaniVet/` (ruta de GitHub Pages) | **6 / 6 aprobadas** (2 min 8 s) |
| Las mismas pruebas en GitHub Actions (servidores de GitHub, Ubuntu) | **Aprobadas**: tipos, 42 unitarias, compilación y 6 / 6 E2E (2,3 min) en la [ejecución n.º 1](https://github.com/isgrom1/DaniVet/actions/runs/38176565733) |
| Versión 1.1.0 en GitHub Actions ([ejecución n.º 6](https://github.com/isgrom1/DaniVet/actions/runs/38182579543)) | **Aprobadas**: 47 unitarias; 7 E2E en servidor local, incluida la actualización real de la app instalada; flujo completo contra la URL publicada |
| Versión 1.2.0 en GitHub Actions ([ejecución n.º 7](https://github.com/isgrom1/DaniVet/actions/runs/39166686783)) | **Aprobadas** las 4 etapas: tipos, 69 unitarias, compilación y **10 E2E** en servidor local (flujo de aceptación, instalación, dictado y exámenes en los tres iPhone y la actualización real de la app instalada; 2 omitidas a propósito: la actualización se prueba en un solo tamaño); publicación en Pages; y **9 / 9 E2E contra la URL publicada** (https://isgrom1.github.io/DaniVet/), incluido el dictado y la evolución de exámenes |
| Versión 1.2.0 en este entorno (18-10-2026) | Tipos sin errores; **69 / 69 unitarias** (10 archivos); compilación correcta (JS principal 300 KB comprimido, 1,5 MB guardados para uso sin conexión); E2E **9 / 9 aprobadas** en 2,7 min: flujo de aceptación, instalación y dictado y exámenes en los tres iPhone (la actualización real se ejecuta en GitHub Actions) |
| Versión 1.2.1 en este entorno (18-10-2026) | Tipos sin errores; **72 / 72 unitarias**; compilación correcta; E2E **9 / 9 aprobadas** (la actualización real se ejecuta en GitHub Actions) |
| Versión 1.2.1 en GitHub Actions ([ejecución n.º 8](https://github.com/isgrom1/DaniVet/actions/runs/39170195819)) | **Aprobadas** las 4 etapas: pruebas (tipos, unitarias, compilación y E2E en servidor local), publicación en Pages y E2E contra la URL publicada |
| Versión 1.3.0 en este entorno (21-10-2026) | Tipos sin errores; **78 / 78 unitarias** (11 archivos); compilación correcta (JS principal 309 KB comprimido; el SDK de Anthropic, 58 KB comprimido, se carga solo al usar la lectura con IA; 1,7 MB guardados para uso sin conexión); E2E **12 / 12 aprobadas** en 3 min: flujo de aceptación, instalación, dictado y exámenes, y **lectura de informes con IA** (API simulada) en los tres iPhone (3 omitidas a propósito: la actualización real se ejecuta en GitHub Actions) |
| Versión 1.3.0 en GitHub Actions ([ejecución n.º 9](https://github.com/isgrom1/DaniVet/actions/runs/39533391705), 21-10-2026) | **Aprobadas** las 4 etapas: tipos, 78 unitarias, compilación y **13 E2E** en servidor local (flujo de aceptación, instalación, dictado y exámenes, y lectura con IA con la API simulada en los tres iPhone, más la actualización real de la app instalada; 2 omitidas a propósito); publicación en Pages; y **12 / 12 E2E contra la URL publicada** (https://isgrom1.github.io/DaniVet/), incluida la lectura con IA |
| Contra la URL publicada (https://isgrom1.github.io/DaniVet/, desde Internet) | **6 / 6 aprobadas** (1,9 min) en la [ejecución n.º 3](https://github.com/isgrom1/DaniVet/actions/runs/38177804095); además `HTTP/2 200` por HTTPS (con HSTS) y manifiesto, service worker e ícono para iPhone con respuesta 200 |
| En un iPhone real | **No realizada** (ver "Lo que no se pudo probar") |

## Extremo a extremo: el flujo de aceptación

Archivo `e2e/acceptance.spec.ts`. Se ejecuta en Chromium emulando **iPhone SE (3.ª gen.)**, **iPhone 15** y **iPhone 15 Pro Max** (pantalla, densidad, táctil y agente de usuario de iOS), en español de Chile y zona horaria de Santiago. Cada paso verifica lo que la usuaria vería y guarda capturas en `e2e/.artifacts/<iphone>/`.

1. **Crear la cuenta** (nombre, título, contraseña, aceptación); se muestra la clave de recuperación con el formato esperado.
2. **Validaciones** del formulario de tutor: nombre y teléfono obligatorios, teléfono y RUT inválidos.
3. **Registrar al tutor** con dirección e indicaciones; enlaces de llamada y WhatsApp correctos.
4. **Posible duplicado**: mismo teléfono → aviso "Posibles coincidencias" y confirmación; no se fusiona.
5. **Dos animales del mismo tutor** (perro y gato) con datos según la especie.
6. **Agendar la visita** para ambos: estado "Pendiente", enlaces de WhatsApp y mapas, vista día y semana, **aviso de superposición** al intentar otra visita a la misma hora.
7. **Abrir el paciente** desde la visita e **iniciar la consulta** eligiendo el paciente.
8. **Consulta sin valores precargados**: peso y temperatura vacíos y ningún sistema marcado como normal; se registran examen, hallazgo alterado y diagnóstico.
9. **Tratamiento con la calculadora de dosis**: con unidades incompatibles se detiene; con datos completos calcula 0,504 mL; el botón queda deshabilitado hasta confirmar la revisión.
10. **Vacuna** desde la consulta (lote, vencimiento del producto y próxima dosis por separado).
11. **Receta**: trae el tratamiento de la consulta, advierte que falta el RUT, se emite, se descarga el **PDF** y se lee su texto (profesional, paciente, tutor, medicamento, dosis, frecuencia y cálculo revisado); "Abrir / imprimir" abre una pestaña sin sacar a la usuaria de la app.
12. **Cobro** con dos ítems y abono de $20.000; pago del saldo de $30.000; **comprobante PDF** con la leyenda "NO VÁLIDO COMO BOLETA NI FACTURA".
13. **Finalizar la consulta** y marcar la visita como completada; registros vinculados visibles.
14. **Enmienda** con motivo: se conserva la versión 1 y se muestra el motivo.
15. **Cerrar y volver a abrir**: pide la contraseña, rechaza una incorrecta y abre con la correcta.
16. **Persistencia y asociaciones**: pacientes, historial, vacunas, recetas, peso corregido, tutor con 2 mascotas y sin deuda.
    - 16b. **Sugerencias y actualizaciones**: el mensaje para WhatsApp incluye el texto, la versión y el equipo (y no datos de tutores); *Buscar actualizaciones* informa "Ya tienes la última versión".
17. **Respaldo cifrado** (sin texto legible), **verificación** con contraseña incorrecta y correcta, **exportación abierta** con contraseña: se comprueba en el ZIP que pacientes→tutor, consulta→receta/vacuna/cobro y pagos→cobro conservan sus relaciones.
18. **Reglas de acceso**: IndexedDB no contiene en claro nombres, diagnósticos, medicamentos, direcciones, teléfonos ni el nombre de la profesional; "Bloquear ahora" impide ver datos aunque se navegue a una pantalla interna; **otro perfil del navegador** (otra persona) no ve ningún dato.
19. **Restaurar el respaldo en otro teléfono** (contexto vacío): aparecen pacientes, tutora, consulta finalizada y receta.
20. **Sin conexión**: con la red cortada la app abre desde el service worker, se desbloquea, muestra el aviso "Sin conexión", registra un peso y lo conserva tras recargar.

Además, `e2e/voice-labs.spec.ts` (**dictado y valores de exámenes**, versión 1.2.0) en los tres iPhone: avisa los datos importantes que faltan; dicta una consulta completa (el texto llega al cuadro como lo escribe el micrófono del teclado), revisa la vista previa (cada dato con su frase de origen, lo no reconocido, lo que aún faltaría), desmarca un dato y agrega el resto; comprueba cada campo en la ficha, la marca «Dictado: revisar», que corregir un dato lo deja revisado, que no se puede finalizar sin revisar y que el texto dictado queda en la consulta finalizada. Luego registra dos exámenes de bioquímica (uno escrito, con los campos de referencia vacíos al comenzar, y otro dictado), verifica el rango recordado del mismo laboratorio, el valor anterior con su diferencia y la marca «Alto»; y en la ficha del paciente la tabla de evolución, los filtros (fuera de rango, examen específico comparado con el anterior, búsqueda por sigla) y el gráfico de un valor.

Además, `e2e/ai-reader.spec.ts` (**lectura de informes con IA**, versión 1.3.0) en los tres iPhone, con `api.anthropic.com` simulado (no se usa una clave real ni tiene costo): sin activar, el examen no ofrece la lectura y «Dictar o pegar» explica cómo activarla, sin ninguna conexión a Anthropic; al activarla, el botón exige aceptar el aviso, una clave inválida se rechaza con un mensaje claro y la válida se prueba (`GET /v1/models/claude-opus-5-5`) antes de guardarse; IndexedDB no contiene la clave en claro; en un hemograma nuevo se elige una foto (selector de archivos del sistema), se muestra qué se enviará y no se envía nada hasta tocar «Leer con IA»; una cuenta sin saldo muestra su mensaje y se reintenta; lo leído queda en el cuadro de texto y en la vista previa (con unidad y rango) y lo no reconocido aparte; la solicitud usa el modelo indicado, la foto en JPEG, la clave de la profesional y no contiene el nombre del paciente, del tutor ni de la profesional; se desmarca un valor, se agregan los demás (con la marca «Alto») y se guarda; al desactivar, se borra la clave y el examen deja de ofrecer la lectura.

Además, `e2e/update.spec.ts` (**actualización real**, en GitHub Actions en cada cambio) instala la app, compila una versión nueva mientras está abierta y comprueba: con la app bloqueada, la versión nueva se instala sola al abrirla (servida por la app instalada, no por la red); en uso, aparece el aviso sin interrumpir y la versión se instala al bloquear; los datos se conservan; y las novedades se muestran una sola vez.

Además, `la app se puede instalar` comprueba el manifiesto (`standalone`, `es-CL`, ícono 512×512), el ícono para iPhone, las etiquetas para pantalla de inicio y la política de seguridad de contenidos.

Durante todo el flujo se registran los errores de JavaScript de la página: **ninguno**.

## Pruebas unitarias (78)

| Archivo | Pruebas | Qué verifica |
| --- | --- | --- |
| `src/data/repo.test.ts` | 9 | Cifrado en reposo; contraseña incorrecta; recuperación con clave; PIN con 5 intentos; validación en español; integridad referencial; consulta finalizada bloqueada y enmiendas; conflictos de edición; lotes atómicos |
| `src/data/migrations.test.ts` | 4 | Versión inicial; migración aplicada una sola vez, cifrada y registrada; rechazo de datos de una versión más nueva; respaldo antiguo migrado y respaldo más nuevo rechazado |
| `src/features/backup/backup.test.ts` | 3 | Respaldo sin texto legible; verificación; restauración en dispositivo vacío con asociaciones y adjuntos; restauración con clave de recuperación; detección de manipulación |
| `src/features/domain.test.ts` | 6 | Totales, abonos y saldos; recordatorios solo con fechas registradas; control pendiente hasta registrarlo; enmienda con versión anterior; duplicados sin fusión; superposición y traslado |
| `src/features/prescriptions/dose.test.ts` | 8 | mg/kg con mg/mL; µg a mg y comprimidos; % p/v; detención por falta de peso, unidades incompatibles y valores inválidos; dosis fija; intervalos irregulares |
| `src/pdf/pdf.test.ts` | 3 | Receta, certificado de vacunación y comprobante interno (texto extraído del PDF); reemplazo de caracteres no admitidos |
| `src/changelog.test.ts` | 5 | Cada versión tiene sus novedades (coincide con `package.json`), comparación de versiones, novedades desde la última versión vista, mensaje de sugerencia sin datos personales |
| `src/lib/utils.test.ts` | 9 | Teléfonos chilenos, RUT (con K), números y montos, fechas locales y edades, búsqueda sin tildes, CSV seguro, clave de recuperación y contraseñas |
| `src/features/voice/voice.test.ts` | 11 | Dictado de la consulta: números con cifras o palabras, palabras clave que no cortan frases, reparto de un dictado completo en sus campos, nada inventado (valores no dictados ausentes, imposibles desmarcados, ningún sistema normal sin dictarlo), dictado sin puntuación con varios medicamentos, gramos, soplos y escala de condición corporal; aplicación con marca «dictado», transcripción guardada, "resto normal" sin pisar hallazgos, finalización bloqueada hasta revisar, sin duplicar diagnósticos ni tratamientos |
| `src/features/exams/labs.test.ts` | 14 | Catálogo sin rangos propios, alto/bajo solo con el rango informado, conversión de recuentos, búsqueda; dictado de valores (miles chilenos, "250 mil", %, rangos, tira de orina, números en palabras); informe pegado (unidad y rango por línea, siglas entre paréntesis, líneas no reconocidas aparte, sin cruzar de línea, unidades del informe como µmol/L o g/L); filas del formulario y rangos recordados por laboratorio; tabla de evolución, variación, valor anterior y rangos en la unidad de la fila |
| `src/features/ai/ai.test.ts` | 6 | Lectura con IA con la API simulada: conversión de lo transcrito a líneas que la app interpreta (unidades, rangos solo máximo o mínimo, recuentos absolutos, tira de orina, líneas no reconocidas); solicitud enviada (modelo, salida estructurada, *fallback*, fotos y PDF); mensajes cuando el modelo declina, no encuentra resultados, responde algo inválido o se corta; errores de la cuenta o del servicio en español; formato de la clave; clave cifrada en el teléfono, ilegible para otra bóveda y ausente de respaldos y exportaciones |

## Lo que no se pudo probar

- **iPhone real / Safari (WebKit):** el entorno solo tenía Chromium. Puntos a confirmar en el teléfono: instalación con "Agregar a inicio", creación de la cuenta, PIN, compartir un PDF por WhatsApp e imprimir, guardar el respaldo en Archivos/iCloud Drive y restaurarlo, cámara para fotos, firma con el dedo y desempeño con muchos registros.
- **Lectura con IA contra la API real de Anthropic:** no hay una clave en este entorno (ni debe haberla en el código). Se probó con la API simulada, siguiendo el formato de las respuestas del SDK oficial. Falta la primera lectura real en el iPhone, con la clave de la profesional y un informe conocido: confirmar que la foto (incluida una tomada con la cámara) y un PDF se leen bien y que cada valor coincide con el informe.
- **Hoja de compartir de iOS:** Chromium en Linux no tiene `navigator.share`; las pruebas usan la descarga, que es la alternativa que la app ofrece cuando no se puede compartir.
- **URL publicada desde este entorno:** no tiene acceso a `*.github.io`; por eso la verificación desde Internet la hace el trabajo **Verificar la URL publicada desde Internet** de GitHub Actions, que ejecutó este mismo flujo de aceptación contra la URL real (ver la tabla).

## Cómo repetirlas

```bash
npm ci
npm run typecheck && npm test
npm run build && npm run test:e2e
# Bajo /DaniVet/:
BASE_PATH=/DaniVet/ npm run build
BASE_PATH=/DaniVet/ npx vite preview --port 4174 &
E2E_BASE_URL=http://localhost:4174/DaniVet/ npm run test:e2e
```
