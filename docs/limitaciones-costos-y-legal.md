# Limitaciones conocidas, costos y aspectos legales

## Limitaciones conocidas

**Pruebas y compatibilidad**
- **No se probó en un iPhone real.** Las pruebas automáticas usan Chromium emulando el tamaño, la densidad, el táctil y el agente de usuario de tres iPhone; Safari (WebKit) no está disponible en el entorno donde se construyó la app. Hay que confirmar en el iPhone de la veterinaria: instalación, creación de cuenta, compartir PDF por WhatsApp, guardar el respaldo en Archivos y restaurarlo.
- Requiere **iOS 16.4 o superior** (también funciona en Android y computadores con navegadores modernos).

**Datos**
- Los datos viven **solo en el dispositivo**. Sin respaldo, perder el teléfono o borrar la app significa perder los datos. La app recuerda hacer respaldos, pero no los hace sola.
- **No hay sincronización** entre dispositivos: un respaldo restaurado en otro equipo es una copia; los cambios posteriores no se comparten.
- Si se olvidan **la contraseña y la clave de recuperación**, los datos no se pueden recuperar (por diseño, no existe una llave maestra).
- En iPhone, **Safari y la app instalada guardan datos por separado**: hay que trabajar siempre desde el ícono.
- La app pide al sistema almacenamiento persistente, pero iOS puede liberar espacio en situaciones extremas de almacenamiento lleno. Respaldos semanales recomendados.
- **Si la dirección de la app cambia** (por ejemplo, a un dominio propio), es otro "sitio" para el navegador: los datos no se mueven solos. Se pasa con respaldo y restauración.
- Una sola profesional por dispositivo: no hay cuentas de equipo ni permisos por rol.

**Funciones**
- **Sin notificaciones push:** los recordatorios se ven dentro de la app (Inicio). Enviarlos al teléfono requeriría un servidor de envío. Tampoco se envían mensajes automáticos a tutores: la app abre WhatsApp con el texto listo y la veterinaria lo envía.
- **Calendario:** se exporta cada visita como archivo .ics (una vía). Si luego se cambia la visita en la app, hay que volver a exportarla.
- **Mapas:** abre Apple Maps, Google Maps o Waze; no optimiza rutas. Los tiempos de traslado y el kilometraje los ingresa la veterinaria.
- **Firma dibujada:** sirve como constancia, pero **no es firma electrónica avanzada** (Ley 19.799).
- **Recetas:** el PDF **no reemplaza** la receta electrónica de antimicrobianos del SAG ni la receta retenida oficial de productos controlados; la app lo advierte en cada caso.
- **Cobros:** los comprobantes son internos, **no son boletas ni facturas**; no hay integración con el SII ni pasarela de pago.
- **PDF:** usa fuentes estándar; los caracteres que no admiten (emojis y algunos símbolos) se reemplazan.
- No se conecta al Registro Nacional de Mascotas (solo guarda el número de microchip).
- **Dictado:** usa el micrófono del teclado del iPhone. La app entiende frases que nombran el dato antes del valor («peso 12,4 kilos», «diagnóstico presuntivo…»); un relato libre sin esas palabras queda como texto sin ubicar, que se puede agregar a mano. La interpretación es por reglas en el teléfono, no por inteligencia artificial: no se probó con dictados reales de un iPhone (el entorno no tiene Safari ni micrófono), así que conviene probarla en la primera consulta y avisar qué frases no reconoce.
- **Valores de exámenes:** la app no trae rangos de referencia (usa los del informe de cada laboratorio) y no convierte unidades distintas de los recuentos (/µL, ×10³/µL); un mismo valor informado en otra unidad aparece en otra fila.
- **Lectura de informes con IA (opcional, desde la versión 1.3.0):** necesita internet y una clave propia de la API de Claude con saldo. La IA puede leer mal un número o una unidad (por eso cada valor se revisa antes de agregarlo) y las fotos borrosas, cortadas o con reflejos se leen peor. Se probó con la API de Anthropic **simulada** (sin clave real): la primera lectura real conviene hacerla en el iPhone con un informe conocido, comparando valor por valor. Las líneas que la app no reconoce se muestran aparte y se agregan con «Otro valor». La clave queda guardada (cifrada) en el teléfono: quien desbloquee la app podría usarla, por eso conviene fijar un límite de gasto en la Consola de Claude.

## Costos

**Hoy: $0.** La lectura de informes con IA es opcional y la paga cada profesional a Anthropic (ver la tabla).

| Concepto | Costo | Nota |
| --- | --- | --- |
| Hosting en GitHub Pages | Gratis | Con el plan gratuito de GitHub el repositorio debe ser público (se publica el código, no los datos). |
| GitHub Actions (pruebas y publicación) | Gratis | Ilimitado en repositorios públicos; en privados, el plan gratuito incluye minutos mensuales de sobra para este uso. |
| Base de datos / servidores | No aplica | Los datos están en el teléfono. |
| Certificado HTTPS | Gratis | Incluido en GitHub Pages. |
| Lectura de informes con IA (opcional) | Aprox. US$0,03 a US$0,10 por informe, según sus páginas | Desactivada por defecto. La cobra Anthropic a la cuenta de API de cada profesional (créditos de la Consola de Claude, con límite de gasto); la app no cobra ni intermedia. |

**Opcionales y futuros (no contratados):**

| Opción | Costo aproximado | Cuándo tendría sentido |
| --- | --- | --- |
| Mantener el código privado con Pages (GitHub Pro) | Alrededor de US$4 al mes | Si no se quiere publicar el código. |
| Dominio propio `.cl` (NIC Chile) | Del orden de $10.000 CLP al año | Para una dirección más corta; requiere migrar datos con respaldo (ver arriba). |
| Sincronización y respaldo automático en la nube (p. ej., Supabase) | Plan gratuito con límites; planes pagos desde unos US$25 al mes | Si se necesita usar varios dispositivos o respaldos automáticos. |
| Notificaciones push | Servidor de bajo costo o gratuito con límites, más desarrollo | Si los recordatorios dentro de la app no bastan. |
| App nativa en App Store | US$99 al año (Apple Developer Program) | Solo si se necesitan funciones nativas. |
| Boletas de honorarios | El SII ofrece emisión gratuita en sii.cl | Se emiten fuera de la app. |
| Interpretación del dictado de la consulta con IA | Costo por uso del proveedor, con la misma clave propia (sin servidor intermedio) | Si las reglas actuales no bastan. Implica enviar texto clínico a un tercero (consentimiento informado de la profesional y aviso a sus clientes). |

Los precios de terceros son referenciales: verifícalos antes de contratar. No acepté compromisos de pago ni contraté servicios.

## Aspectos legales (Chile)

> Esto es información de contexto revisada en octubre de 2026, **no asesoría legal**. No se afirma cumplimiento normativo completo: la responsabilidad del tratamiento de datos y de los documentos clínicos es de la profesional.

- **Datos personales:** rige la **Ley N.º 19.628**. La **Ley N.º 21.719** (publicada el 13-12-2024), que crea la Agencia de Protección de Datos Personales, tiene su entrada en vigencia fijada para el **1 de diciembre de 2026**; en septiembre de 2026 se ingresó un proyecto para postergarla un año (Boletín 18.623-07), que a la fecha de esta revisión seguía en tramitación. La app ayuda con: datos cifrados en el dispositivo, sin terceros (salvo la lectura de informes con IA, opcional), exportación por paciente, edición y anonimización del tutor, historial de cambios.
- **Recetas veterinarias:** Decreto N.º 25 de 2005 del Ministerio de Agricultura; receta retenida en formato oficial y manuscrito para ciertos productos (Res. Ex. SAG N.º 667/2010); antimicrobianos de uso veterinario en el Sistema de Prescripción Electrónica del SAG (Res. Ex. N.º 4116/2023 y modificaciones), incluidos animales de compañía.
- **Lectura de informes con IA:** al usarla, la profesional envía a Anthropic (Estados Unidos) los informes que elige, que pueden incluir datos personales del tutor: es una comunicación de datos a un proveedor en el extranjero. Recomendaciones: enviar solo lo necesario (recortar la foto), mencionarlo en el aviso de privacidad a los clientes y revisar las condiciones de Anthropic. Según su centro de privacidad (consultado en octubre de 2026), lo recibido por la API no se usa para entrenar modelos y se elimina en un plazo de hasta 30 días, con excepciones (obligaciones legales, infracciones de uso). No evalué el cumplimiento de las reglas de transferencia internacional de la Ley 21.719.
- **Tenencia responsable:** Ley N.º 21.020 (identificación y registro de perros y gatos).
- **Firma electrónica:** Ley N.º 19.799; la firma dibujada de la app no es firma electrónica avanzada.
- **Tributario:** los comprobantes de la app no son documentos tributarios; las boletas de honorarios se emiten en el SII.
- **Fichas clínicas:** no verifiqué una norma chilena específica sobre plazos de conservación de fichas veterinarias; la app no borra fichas automáticamente y conserva las versiones anteriores de las consultas corregidas.
