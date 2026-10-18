# Resultados de las pruebas

Ejecutadas el 11 de octubre de 2026 sobre el código de esta rama. Todas las cifras corresponden a ejecuciones reales.

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

Además, `e2e/update.spec.ts` (**actualización real**, en GitHub Actions en cada cambio) instala la app, compila una versión nueva mientras está abierta y comprueba: con la app bloqueada, la versión nueva se instala sola al abrirla (servida por la app instalada, no por la red); en uso, aparece el aviso sin interrumpir y la versión se instala al bloquear; los datos se conservan; y las novedades se muestran una sola vez.

Además, `la app se puede instalar` comprueba el manifiesto (`standalone`, `es-CL`, ícono 512×512), el ícono para iPhone, las etiquetas para pantalla de inicio y la política de seguridad de contenidos.

Durante todo el flujo se registran los errores de JavaScript de la página: **ninguno**.

## Pruebas unitarias (69)

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
| `src/features/exams/labs.test.ts` | 11 | Catálogo sin rangos propios, alto/bajo solo con el rango informado, conversión de recuentos, búsqueda; dictado de valores (miles chilenos, "250 mil", %, rangos, tira de orina, números en palabras); filas del formulario y rangos recordados por laboratorio; tabla de evolución, variación, valor anterior y rangos en la unidad de la fila |

## Lo que no se pudo probar

- **iPhone real / Safari (WebKit):** el entorno solo tenía Chromium. Puntos a confirmar en el teléfono: instalación con "Agregar a inicio", creación de la cuenta, PIN, compartir un PDF por WhatsApp e imprimir, guardar el respaldo en Archivos/iCloud Drive y restaurarlo, cámara para fotos, firma con el dedo y desempeño con muchos registros.
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
