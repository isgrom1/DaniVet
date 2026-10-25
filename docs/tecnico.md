# Documentación técnica de DApp

## 1. Arquitectura en una página

```
iPhone (Safari / app instalada en la pantalla de inicio)
└── PWA estática (HTML + JS + CSS) servida por HTTPS desde GitHub Pages
    ├── Service worker (Workbox): guarda la app completa para usarla sin conexión
    ├── React 19 + React Router (HashRouter) + Tailwind CSS 4
    ├── Estado en memoria (zustand) ── se carga al desbloquear, se borra al bloquear
    └── IndexedDB "vetcasa" (en el teléfono)
        ├── meta     : cabecera de la bóveda (claves envueltas), versión del modelo, sesión de PIN
        ├── records  : un registro por fila, cifrado con AES-256-GCM  ([tabla, id] → {iv, ct, rev})
        └── blobs    : fotos y documentos, cifrados

Opcional (desactivado por defecto): lectura de informes con IA
└── api.anthropic.com ← la foto o el PDF que elige la profesional, con su propia clave (solo al tocar "Leer con IA")
```

- **Sin servidor ni base de datos remota.** El hosting solo entrega archivos estáticos; nunca recibe datos. No hay claves, tokens ni contraseñas en el código ni en el repositorio. La única conexión externa es opcional: la lectura de informes con IA (§7), con la clave que ingresa cada profesional.
- **Local-first:** todo funciona sin conexión. La única copia de los datos está en el teléfono; los respaldos cifrados son la forma de llevarlos a otro lugar.
- **¿Por qué no un backend (Supabase, Firebase…)?** Exigiría contratar o configurar servicios, administrar credenciales y asumir el tratamiento de datos clínicos en un tercero; además, el entorno de construcción no tenía acceso a esos proveedores. La arquitectura deja abierta una sincronización futura (ver §9).

## 2. Estructura del código

```
.github/workflows/publicar.yml   Pruebas en cada cambio; publicación en Pages y verificación de la URL real
docs/                            Esta documentación
e2e/                             Pruebas de extremo a extremo (Playwright) y utilidades
public/                          Íconos (incluido apple-touch-icon), favicon
scripts/                         Generación de íconos y exploración visual
src/
  main.tsx, App.tsx              Arranque, estados de la bóveda (sin cuenta / bloqueada / lista) y rutas
  components/                    Botones, tarjetas, formularios accesibles, hojas y diálogos, barra inferior
  data/                          Capa de datos
    schema.ts                    Esquemas zod de las 32 tablas (fuente de verdad del modelo)
    relations.ts                 Claves foráneas (verificadas en cada escritura y eliminación)
    repo.ts                      Carga, validación, lotes atómicos, bloqueo de registros finalizados, historial
    migrations.ts                Versión del modelo y migraciones
    session.ts, vaultKey.ts      Cuenta, desbloqueo (contraseña, clave de recuperación, PIN), bloqueo
    store.ts, hooks.ts           Estado en memoria y selectores para React
    defaults.ts, labels.ts       Valores iniciales (especies, plantillas, medios de pago) y textos
  features/<módulo>/             Pantallas y lógica de cada módulo (agenda, consultations, prescriptions…)
  features/voice/                Dictado: interpretación del texto dictado (consulta y valores de exámenes)
  features/exams/                Exámenes, catálogo de valores, evolución (tabla y gráfico)
  features/ai/                   Lectura opcional de informes con IA (clave cifrada, envío a Claude, panel de lectura)
  lib/                           Cifrado, IndexedDB, fechas, números, RUT, teléfonos, CSV, compartir archivos,
                                 formato simple de las indicaciones (richText.ts)
  pdf/                           Generación de PDF (pdf-lib, carga diferida)
  test/                          Configuración y utilidades de pruebas unitarias
```

Dependencias de ejecución: `react`, `react-dom`, `react-router-dom`, `zustand`, `zod`, `idb`, `fflate`, `pdf-lib`, `lucide-react` y `@anthropic-ai/sdk` (se descarga solo al usar la lectura con IA). Sin analítica ni fuentes remotas; la CSP solo permite conectarse a `api.anthropic.com` además del propio sitio.

## 3. Modelo de datos (esquema)

Cada registro tiene `id` (UUID), `createdAt`, `updatedAt` y `rev` (revisión para detectar conflictos). Los esquemas están en `src/data/schema.ts`; las relaciones en `src/data/relations.ts`.

| Área | Tablas | Relaciones principales |
| --- | --- | --- |
| Configuración | `profile`, `settings`, `species`, `services`, `medicationRefs`, `protocols`, `templates` | `profile.logoAttachmentId/signatureAttachmentId → attachments`; `protocols.speciesId → species` |
| Personas y animales | `tutors`, `patients`, `weights` | `patients.tutors[].tutorId → tutors` (varios tutores, uno principal); `patients.speciesId → species`; `weights.patientId → patients`; `tutors.mergedIntoId → tutors` |
| Agenda | `appointments` | `tutorId → tutors`; `patientIds[] → patients`; `consultationIds[] → consultations` |
| Clínica | `consultations`, `diagnoses`, `treatments`, `consultationVersions`, `exams`, `documents`, `attachments` | `consultations.patientId/tutorId/appointmentId`; `followUpOfId → consultations`; `diagnoses/treatments.consultationId`; `consultationVersions.consultationId` (instantáneas de enmiendas); `attachments.patientId/consultationId/examId/documentId` |
| Prevención y recetas | `vaccinations`, `dewormings`, `prescriptions` | `patientId`, `consultationId`, `protocolId`, `inventoryItemId/inventoryLotId` |
| Finanzas | `charges`, `payments`, `expenses`, `budgets` | `charges.tutorId/patientId/consultationId/appointmentId/budgetId`; `payments.chargeId → charges`; `items[].serviceId → services` |
| Inventario | `inventoryItems`, `inventoryLots`, `inventoryMovements` | `lots.itemId`; `movements.itemId/lotId/vaccinationId/dewormingId` |
| Seguimiento | `tasks`, `reminders` | `patientId`, `consultationId`, `examId`, `tutorId` |
| Trazabilidad | `auditLog`, `drafts` | `auditLog.entity/entityId` (tabla e id del registro afectado); `drafts`: formularios en curso (cifrados) |

Reglas que impone la capa de datos (`repo.ts`), no solo la interfaz:

- **Integridad referencial:** no se guarda un registro que apunte a otro inexistente ni se elimina uno referenciado.
- **Registros cerrados:** una consulta finalizada solo cambia mediante **enmienda con motivo** (la versión anterior completa se guarda en `consultationVersions`) o anulación con motivo; recetas y documentos emitidos solo pueden anularse; diagnósticos y tratamientos de una consulta finalizada quedan bloqueados (salvo el estado del tratamiento durante el seguimiento).
- **Lotes atómicos:** varias escrituras se confirman juntas o ninguna (una transacción de IndexedDB).
- **Conflictos:** si el registro cambió desde que se abrió el formulario (otra pestaña), se rechaza la escritura en vez de sobrescribir.
- **Historial:** las tablas clínicas, de personas y finanzas registran en `auditLog` quién/cuándo/qué cambió (cifrado como todo lo demás).
- **Procedencia:** los campos de la consulta llevan marca de origen (profesional, tutor, documento, calculado, copiado, plantilla, dictado); lo copiado, de plantilla o dictado debe revisarse antes de finalizar.

Campos agregados en la versión 1.2.0 (todos opcionales, por eso no requirieron migración ni subir `DATA_VERSION`):

| Campo | Contenido |
| --- | --- |
| `consultations.dictations[]` | Texto dictado tal como llegó (`{ id, at, text }`), para trazabilidad. |
| `consultations.provenance[].source = 'dictated'` | Dato agregado desde el dictado; `fromId` apunta al dictado. Los diagnósticos y tratamientos dictados usan la ruta `diagnoses.<id>` / `treatments.<id>`. |
| `exams.values[]` | Valores del examen: `analyte` (código del catálogo o `custom:<nombre>`), `name`, `value` (número) o `text` (resultado cualitativo), `unit`, `refLow`/`refHigh` (rango **informado por el laboratorio**), `note`. |
| `settings.labRanges` | Rangos recordados por `especie|laboratorio|analito` (se guardan al registrar un examen y se proponen en el siguiente del mismo laboratorio). |

## 4. Migraciones

No hay un servidor de base de datos, así que las "migraciones" ocurren en el teléfono:

- **Estructura de IndexedDB** (`src/lib/idb.ts`): versión 1 con los almacenes `meta`, `records` (índice por tabla) y `blobs`. Un cambio de estructura se hace subiendo la versión en `openDB` y agregando el paso en `upgrade`.
- **Modelo de datos** (`src/data/migrations.ts`): `DATA_VERSION` (hoy **1**) se guarda en `meta.dataVersion` al crear la cuenta y en cada respaldo (`manifest.dataVersion`).
  - Al desbloquear, si la versión guardada es menor, se aplican en orden las migraciones pendientes sobre los registros descifrados, se vuelven a guardar cifrados (con `rev + 1`) y se anota en el historial. Ocurre una sola vez.
  - Si la versión guardada es **mayor** que la de la app (datos o respaldo de una versión más nueva), la app no los abre y pide actualizarse, para no dañarlos.
  - Al restaurar un respaldo antiguo, se migra al abrirlo.
  - Agregar **campos opcionales** no requiere migración (los esquemas aceptan registros sin ellos).
- **Cómo agregar una migración:** subir `DATA_VERSION`, agregar `{ to, description, run }` en `MIGRATIONS`, ajustar `schema.ts` y agregar una prueba en `src/data/migrations.test.ts` (ya incluye pruebas del mecanismo).

## 5. Seguridad

- **Bóveda:** una clave de datos aleatoria (DEK, AES-256-GCM) cifra cada registro con datos asociados `vetcasa:<tabla>:<id>` (un registro cifrado no puede moverse a otra tabla u otro id sin detectarse). Los adjuntos usan `vetcasa:blob:<id>`.
- **La DEK se guarda envuelta dos veces:** con una clave derivada de la contraseña (PBKDF2-SHA256, 600.000 iteraciones, sal aleatoria) y con la **clave de recuperación** (160 bits aleatorios, en base32 de Crockford, 32 caracteres). Ninguna de las dos se guarda.
- **PIN opcional:** guarda una copia **no extraíble** de la DEK (`CryptoKey` de WebCrypto) en IndexedDB durante 14 días; 5 intentos fallidos la eliminan. Es una comodidad: la protección fuerte es la contraseña.
- **Bloqueo:** por inactividad (15 min por defecto), al volver de segundo plano tras ese tiempo y manualmente. Al bloquear se descarta la DEK y los datos en memoria.
- **Navegador:** CSP estricta (`default-src 'self'`, sin scripts externos ni `eval`; `connect-src` agrega solo `https://api.anthropic.com` para la lectura opcional con IA), `referrer` desactivado, `robots: noindex`, sin cookies, sin analítica.
- **Clave de la API de Claude (opcional):** se guarda en `meta` con la clave `aiKey`, cifrada con la DEK (datos asociados `vetcasa:meta:aiKey`). No es un registro: no entra en respaldos ni en la exportación abierta; se borra al eliminar todos los datos y al restaurar un respaldo (la restauración vacía `meta`). Una clave cifrada con otra bóveda se ignora.
- **Archivos:** los PDF y la exportación abierta no están cifrados (se advierte al generarlos); la exportación abierta exige la contraseña. No hay enlaces públicos a archivos clínicos: todo se genera en el teléfono.
- **Notificaciones:** la app no envía notificaciones; por eso no hay datos clínicos en la pantalla bloqueada.
- Pruebas: `src/data/repo.test.ts` (cifrado en reposo, contraseña incorrecta, recuperación), paso 18 de `e2e/acceptance.spec.ts` (lee IndexedDB y comprueba que no contiene nombres, diagnósticos, medicamentos ni teléfonos en claro; otro perfil del navegador no ve datos; el bloqueo impide el acceso).

## 6. Publicación (GitHub Pages)

El flujo `.github/workflows/publicar.yml` se ejecuta en cada push:

1. **Pruebas:** `npm ci`, tipos, pruebas unitarias, compilación y pruebas E2E en tres tamaños de iPhone emulados. Guarda capturas y resultados como artefacto.
2. **¿Pages activado?:** consulta la API de GitHub. Si no lo está, termina con un aviso (no falla) explicando qué activar.
3. **Publicar** (solo rama por defecto): compila con la ruta base que entrega `actions/configure-pages` (`/DaniVet/`) y despliega con `actions/deploy-pages`.
4. **Verificar:** espera a que la URL responda por HTTPS, comprueba la página, el manifiesto, el service worker y el ícono, y ejecuta **el flujo de aceptación completo contra la URL publicada**.

Requisitos (una sola vez, ya hechos el 11-10-2026): repositorio público (o plan pago) y *Settings → Pages → Source: GitHub Actions*. Los cambios que solo tocan documentación (`docs/`, archivos `.md`) no vuelven a publicar la app, para no mostrar avisos de actualización innecesarios.

Para publicar en otro hosting estático (Netlify, Cloudflare Pages, un dominio propio): `BASE_PATH=/ npm run build` y subir la carpeta `dist/`. Se necesita HTTPS (requisito del service worker y de WebCrypto).

## 7. Mantención

- **Actualizar dependencias:** `npm outdated`, actualizar, luego `npm run typecheck && npm test && npm run build && npm run test:e2e`. `npm audit` estaba en 0 vulnerabilidades al entregar.
- **Cambiar el nombre de la app:** ver la sección siguiente.
- **Íconos:** `scripts/icon-source.mjs` y `npm run icons`.
- **Especies, rangos de referencia, medicamentos frecuentes, pautas de vacunación, plantillas, servicios y medios de pago:** se configuran dentro de la app (*Más › …*), no requieren cambios de código.
- **Publicar una versión:** seguir la lista de `CLAUDE.md` (subir versión, agregar novedades en `src/changelog.ts`, pruebas, push a la rama por defecto y revisar que el flujo termine en verde).
- **Cómo llega la actualización a cada teléfono** (`src/lib/sw.ts`): la app busca versión nueva al abrirse, al volver a primer plano y cada hora. Si está bloqueada la instala de inmediato; si está en uso muestra "Actualizar ahora" y, si no se toca, la instala al bloquearse (antes guarda lo abierto). Luego muestra las novedades una vez (`src/features/more/WhatsNew.tsx`). *Más › Acerca de la app › Buscar actualizaciones* fuerza la búsqueda.
- **Sugerencias desde la app:** *Más › Sugerir un cambio o reportar un problema* arma un mensaje (texto de la usuaria + versión + tipo de equipo, sin datos clínicos) y lo abre en WhatsApp o en el correo para elegir el destinatario.
- **Revisión periódica sugerida:** cambios normativos (Ley 21.719, recetas SAG), compatibilidad con la última versión de iOS y que el flujo de publicación siga en verde.

### Dictado (voz a ficha)

- **Captura:** el micrófono del **teclado del iPhone** escribe en un cuadro de texto (`src/features/voice/DictationSheet.tsx`). No se usa la API de reconocimiento de voz del navegador: en las apps web instaladas en la pantalla de inicio de iOS no es confiable ([WebKit 225298](https://bugs.webkit.org/show_bug.cgi?id=225298), [foros de Apple](https://developer.apple.com/forums/thread/748048)). Según el modelo e idioma, Apple procesa el dictado en el teléfono o en sus servidores ([soporte de Apple](https://support.apple.com/es-us/HT208343)); la app solo recibe el texto.
- **Interpretación local y determinista** (`src/features/voice/text.ts`, `consultation.ts`): se pliega el texto (minúsculas, sin tildes, mismo largo), se buscan palabras clave por campo y se corta el texto entre ellas. Las palabras ambiguas ("abdomen", "dieta", "tratamiento") solo cuentan al comenzar una frase, si van seguidas de ":"/"normal", o a mitad de frase cuando el contexto lo indica (p. ej. un sistema después de otro dato del examen y seguido de "con", "sin", "normal"). Los números aceptan coma o punto, palabras ("treinta y ocho coma cinco"), gramos y "kilos y gramos"; los valores imposibles se proponen desmarcados. Los tratamientos se separan por frase o por medicamento (un nombre nuevo seguido de otra dosis) y conservan dosis, vía, frecuencia y duración **tal como se dictaron**: no se sugiere ni completa ninguna dosis.
- **Aplicación** (`src/features/voice/apply.ts`): solo lo marcado en la vista previa; cada dato queda con procedencia `dictated` sin revisar (editarlo lo deja revisado; `reviewDictatedOnEdit` en `consultations/model.ts`). "Resto normal" solo afecta a los sistemas que siguen "No evaluado" y que no se dictaron. Diagnósticos y tratamientos ya existentes no se duplican. Lo no ubicado queda en `dictations`.
- **Datos importantes sin registrar:** `missingImportant()` en `consultations/model.ts` (aviso, no bloquea la finalización).
- **Valores de exámenes:** catálogo en `src/features/exams/analytes.ts` (nombres, unidades habituales, sinónimos; **sin rangos**), dictado o texto pegado en `src/features/voice/labs.ts` (miles chilenos "250.000", "250 mil", "%", rangos con palabra clave "referencia 0,5 a 1,5" o como vienen en un informe "0,5 - 1,5", "(37 - 55)", "< 120"; unidades del informe como "x10^3/uL", "/mm3", "g/L" o "µmol/L"; siglas entre paréntesis "ALT (GPT)"; marcas "H"/"*"; tira de orina "dos cruces"; el valor debe estar en la misma línea que su nombre y lo no reconocido se informa por línea), formulario en `LabValuesEditor.tsx`, evolución en `trends.ts` (filas por valor y grupo de unidad; recuentos /µL ↔ ×10³/µL se convierten, % va en otra fila; la fecha de cada examen es la toma de muestra o, si falta, la solicitud), tabla y filtros en `LabTrends.tsx`, gráfico en `LabChart.tsx` (colores validados por contraste y daltonismo: serie `#00876c`, fuera de rango `#b45309` con forma ▲/▼ además del color; la lista de valores es su equivalente accesible).
- **Mejora posible (requiere autorización):** interpretar el dictado de la consulta con un modelo de lenguaje daría más flexibilidad. Podría usar la misma clave propia que la lectura de informes (sin servidor intermedio), pero implica un costo por uso y enviar texto clínico a un tercero.

### Indicaciones con formato y para varios pacientes (1.4.0)

- **Formato simple** (`src/lib/richText.ts`): se guarda como texto en los mismos campos, sin cambiar el esquema. `## Título` = subtítulo; `• texto` o `- texto` = viñeta; `**texto**` = negrita; dos o más líneas seguidas con `|` = tabla (la primera es el encabezado; se ignora la línea `---` de Markdown; una sola línea con `|` sigue siendo texto). La barra de formato (`src/components/RichText.tsx`, `RichTextArea`) inserta las marcas con funciones puras (`toggleLinePrefix`, `toggleBold`, `tableAt`, `tableText`, `insertBlock`); las tablas se escriben celda por celda en una hoja (2 a 4 columnas).
- **Dónde se usa:** `plan.homeCare` y `plan.ownerRecommendations` de la consulta, y los campos «Indicaciones» y «Signos de alarma» del documento de indicaciones. El PDF lo dibuja con `PdfWriter.rich()` (`src/pdf/engine.ts`): subtítulo en color con línea inferior, viñetas con sangría, negritas dentro de la línea y tablas centradas con encabezado de color y filas alternadas (el encabezado se repite si la tabla cambia de página). Si el texto empieza con un subtítulo propio, ese subtítulo reemplaza al título de la sección. El informe clínico y la ficha completa muestran el mismo texto sin marcas (`plainRichText`); la consulta finalizada lo muestra con formato (`RichTextView`).
- **Varios pacientes:** `ownerInstructionsPdf(consultaId, otrosPacientes)` (los elige la profesional al tocar «Indicaciones al tutor»; solo se ofrecen pacientes activos del mismo tutor y ninguno viene marcado). El documento de indicaciones guarda `documents.otherPatientIds` (campo opcional nuevo, sin migración; relación verificada en `relations.ts`), y aparece también en la historia de esos pacientes.
- **Peso:** el de la atención (`exam.weightKg`) o, si no hay, el último registrado (`latestWeight`), con su fecha si es de otro día; sin registro se escribe «Sin registro» (nunca se completa un valor).

### Lectura de informes con IA (opcional)

- **Activación** (`src/features/settings/AiSettings.tsx`, ruta `#/ajustes/ia`): la profesional pega su clave de la API de Claude (formato `sk-ant-…`), acepta el aviso de qué se envía y la app la prueba con `GET /v1/models/claude-opus-5-5` (sin costo) antes de guardarla cifrada (`src/features/ai/aiKey.ts`). *Desactivar y borrar la clave* la elimina del teléfono (la clave sigue existiendo en la Consola de Claude).
- **Lectura** (`src/features/ai/labReader.ts`, `AiReportPanel.tsx`): hasta 5 fotos o PDF; las fotos se reducen a 1568 px en el lado mayor y se envían en JPEG; los PDF (hasta 15 MB) van completos. Nada se envía hasta tocar *Leer con IA*. Solicitud directa desde el teléfono (`dangerouslyAllowBrowser`, la clave es de la propia usuaria) a `POST /v1/messages` con `claude-opus-5-5`, `max_tokens` 16000, `output_config.effort: medium`, salida estructurada (esquema JSON: `legible` y `lineas` con nombre, valor, unidad, mínimo y máximo), *fallback* del lado del servidor (`fallbacks: 'default'`, beta `server-side-fallback-2026-07-01`: si el modelo declina, Anthropic reintenta con su alternativa) y 1 reintento ante errores transitorios, con tiempo máximo de 120 s. La solicitud no incluye datos de la ficha.
- **La IA solo transcribe:** el sistema le pide copiar lo escrito, omitir lo ilegible y no incluir datos del paciente, tutor ni laboratorio. Cada resultado se convierte en una línea como las de un informe pegado (`Creatinina 1,9 mg/dL 0,5 - 1,5`) que interpreta el mismo `parseLabDictation` de `features/voice/labs.ts`; la profesional revisa y elige en la vista previa, con la foto a la vista para comparar.
- **Errores** con mensaje en español: clave inválida (401), sin saldo o límite de gasto (400/402), permiso (403), modelo no disponible (404), archivo grande (413), límite de uso (429), servicio no disponible (5xx/529), sin conexión o tiempo agotado, modelo que declina (`stop_reason: refusal`) o respuesta cortada (`max_tokens`).
- **Pruebas:** `src/features/ai/ai.test.ts` (conversión a líneas, solicitud enviada, errores y almacenamiento cifrado fuera de respaldos y exportaciones, con la API simulada) y `e2e/ai-reader.spec.ts` (activación, lectura de una foto, revisión y desactivación en los tres iPhone emulados, con `api.anthropic.com` simulado: no se usa una clave real).

### Cambiar el nombre de la app

El nombre visible sale de **una sola línea** de `vite.config.ts`:

```ts
const APP_NAME = process.env.VITE_APP_NAME || 'DApp';
```

Al cambiarla y publicar (push a la rama principal), cambian: el nombre bajo el ícono de inicio y el título (`index.html`, manifiesto), los textos de la app ("Comenzar a usar…", guía de instalación), el pie y los metadatos de los PDF, los mensajes de respaldo y los nombres de archivo (`respaldo-<nombre>-<fecha>.<nombre>`, `exportacion-abierta-<nombre>-…zip`, `clave-recuperacion-<nombre>.txt`). También se puede compilar sin editar el archivo: `VITE_APP_NAME="Otro Nombre" npm run build`.

- **No cambian, a propósito:** el nombre de la base de datos en el teléfono (`vetcasa`), los prefijos del cifrado (`vetcasa:…`) y el identificador del formato de respaldo (`vetcasa-backup`). Si cambiaran, los datos y respaldos existentes dejarían de abrirse. Los respaldos `.vetcasa` antiguos se siguen aceptando.
- **En un iPhone donde la app ya estaba instalada,** el nombre bajo el ícono no se actualiza solo (iOS lo fija al instalar). Para verlo: crear un respaldo, eliminar el ícono, volver a "Agregar a inicio" y restaurar el respaldo. **Eliminar el ícono borra los datos de ese teléfono**: nunca sin respaldo.
- En *Ajustes › Perfil profesional › Nombre de la app* cada profesional puede usar otro nombre en el pie de los PDF y en los eventos de calendario.
- **La URL no cambia con el nombre:** depende del nombre del repositorio (`https://isgrom1.github.io/DaniVet/`). Renombrar el repositorio cambia la ruta; conviene hacerlo antes de que alguien instale la app (una app instalada desde la ruta anterior dejaría de actualizarse).

## 8. Desarrollo y pruebas

```bash
npm ci
npm run dev           # http://localhost:5173
npm run typecheck
npm test              # Vitest + fake-indexeddb (78 pruebas)
npm run build && npm run test:e2e        # Playwright con emulación de iPhone (requiere Chromium)
E2E_BASE_URL=https://isgrom1.github.io/DaniVet/ npm run test:e2e   # contra la URL publicada
```

Las pruebas E2E usan rutas relativas, por lo que funcionan en `/` y bajo `/DaniVet/`. En entornos sin descarga de navegadores se puede indicar el ejecutable con `PW_CHROMIUM_PATH`.

## 9. Evolución posible

- **Sincronización entre dispositivos / respaldo automático en la nube:** requeriría un servicio (por ejemplo Supabase con Row Level Security o almacenamiento de objetos) y cifrado de extremo a extremo con la DEK actual, para que el servidor solo vea datos cifrados. Implica costos y un contrato de tratamiento de datos.
- **Notificaciones push:** iOS 16.4+ las permite en PWA instaladas, pero necesitan un servidor de envío; además habría que cuidar que no muestren datos clínicos en la pantalla bloqueada.
- **App nativa (App Store):** requiere la cuenta de desarrollador de Apple.
- **Documentos tributarios:** integración con un proveedor de boleta de honorarios/factura electrónica del SII.
