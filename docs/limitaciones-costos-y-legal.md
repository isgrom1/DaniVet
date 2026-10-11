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

## Costos

**Hoy: $0.**

| Concepto | Costo | Nota |
| --- | --- | --- |
| Hosting en GitHub Pages | Gratis | Con el plan gratuito de GitHub el repositorio debe ser público (se publica el código, no los datos). |
| GitHub Actions (pruebas y publicación) | Gratis | Ilimitado en repositorios públicos; en privados, el plan gratuito incluye minutos mensuales de sobra para este uso. |
| Base de datos / servidores | No aplica | Los datos están en el teléfono. |
| Certificado HTTPS | Gratis | Incluido en GitHub Pages. |

**Opcionales y futuros (no contratados):**

| Opción | Costo aproximado | Cuándo tendría sentido |
| --- | --- | --- |
| Mantener el código privado con Pages (GitHub Pro) | Alrededor de US$4 al mes | Si no se quiere publicar el código. |
| Dominio propio `.cl` (NIC Chile) | Del orden de $10.000 CLP al año | Para una dirección más corta; requiere migrar datos con respaldo (ver arriba). |
| Sincronización y respaldo automático en la nube (p. ej., Supabase) | Plan gratuito con límites; planes pagos desde unos US$25 al mes | Si se necesita usar varios dispositivos o respaldos automáticos. |
| Notificaciones push | Servidor de bajo costo o gratuito con límites, más desarrollo | Si los recordatorios dentro de la app no bastan. |
| App nativa en App Store | US$99 al año (Apple Developer Program) | Solo si se necesitan funciones nativas. |
| Boletas de honorarios | El SII ofrece emisión gratuita en sii.cl | Se emiten fuera de la app. |

Los precios de terceros son referenciales: verifícalos antes de contratar. No acepté compromisos de pago ni contraté servicios.

## Aspectos legales (Chile)

> Esto es información de contexto revisada en octubre de 2026, **no asesoría legal**. No se afirma cumplimiento normativo completo: la responsabilidad del tratamiento de datos y de los documentos clínicos es de la profesional.

- **Datos personales:** rige la **Ley N.º 19.628**. La **Ley N.º 21.719** (publicada el 13-12-2024), que crea la Agencia de Protección de Datos Personales, tiene su entrada en vigencia fijada para el **1 de diciembre de 2026**; en septiembre de 2026 se ingresó un proyecto para postergarla un año (Boletín 18.623-07), que a la fecha de esta revisión seguía en tramitación. La app ayuda con: datos cifrados en el dispositivo, sin terceros, exportación por paciente, edición y anonimización del tutor, historial de cambios.
- **Recetas veterinarias:** Decreto N.º 25 de 2005 del Ministerio de Agricultura; receta retenida en formato oficial y manuscrito para ciertos productos (Res. Ex. SAG N.º 667/2010); antimicrobianos de uso veterinario en el Sistema de Prescripción Electrónica del SAG (Res. Ex. N.º 4116/2023 y modificaciones), incluidos animales de compañía.
- **Tenencia responsable:** Ley N.º 21.020 (identificación y registro de perros y gatos).
- **Firma electrónica:** Ley N.º 19.799; la firma dibujada de la app no es firma electrónica avanzada.
- **Tributario:** los comprobantes de la app no son documentos tributarios; las boletas de honorarios se emiten en el SII.
- **Fichas clínicas:** no verifiqué una norma chilena específica sobre plazos de conservación de fichas veterinarias; la app no borra fichas automáticamente y conserva las versiones anteriores de las consultas corregidas.
