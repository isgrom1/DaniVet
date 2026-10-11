# Documentación técnica de VetCasa

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
```

- **Sin servidor ni base de datos remota.** El hosting solo entrega archivos estáticos; nunca recibe datos. No hay claves, tokens ni contraseñas en el código ni en el repositorio.
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
  lib/                           Cifrado, IndexedDB, fechas, números, RUT, teléfonos, CSV, compartir archivos
  pdf/                           Generación de PDF (pdf-lib, carga diferida)
  test/                          Configuración y utilidades de pruebas unitarias
```

Dependencias de ejecución: `react`, `react-dom`, `react-router-dom`, `zustand`, `zod`, `idb`, `fflate`, `pdf-lib`, `lucide-react`. Sin servicios externos, analítica ni fuentes remotas (la CSP lo impide).

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
- **Procedencia:** los campos de la consulta llevan marca de origen (profesional, tutor, documento, calculado, copiado, plantilla); lo copiado o de plantilla debe revisarse antes de finalizar.

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
- **Navegador:** CSP estricta (`default-src 'self'`, sin scripts externos ni `eval`), `referrer` desactivado, `robots: noindex`, sin cookies, sin analítica.
- **Archivos:** los PDF y la exportación abierta no están cifrados (se advierte al generarlos); la exportación abierta exige la contraseña. No hay enlaces públicos a archivos clínicos: todo se genera en el teléfono.
- **Notificaciones:** la app no envía notificaciones; por eso no hay datos clínicos en la pantalla bloqueada.
- Pruebas: `src/data/repo.test.ts` (cifrado en reposo, contraseña incorrecta, recuperación), paso 18 de `e2e/acceptance.spec.ts` (lee IndexedDB y comprueba que no contiene nombres, diagnósticos, medicamentos ni teléfonos en claro; otro perfil del navegador no ve datos; el bloqueo impide el acceso).

## 6. Publicación (GitHub Pages)

El flujo `.github/workflows/publicar.yml` se ejecuta en cada push:

1. **Pruebas:** `npm ci`, tipos, pruebas unitarias, compilación y pruebas E2E en tres tamaños de iPhone emulados. Guarda capturas y resultados como artefacto.
2. **¿Pages activado?:** consulta la API de GitHub. Si no lo está, termina con un aviso (no falla) explicando qué activar.
3. **Publicar** (solo rama por defecto): compila con la ruta base que entrega `actions/configure-pages` (`/DaniVet/`) y despliega con `actions/deploy-pages`.
4. **Verificar:** espera a que la URL responda por HTTPS, comprueba la página, el manifiesto, el service worker y el ícono, y ejecuta **el flujo de aceptación completo contra la URL publicada**.

Requisitos (los hace la persona dueña del repositorio, una vez): repositorio público (o plan pago) y *Settings → Pages → Source: GitHub Actions*.

Para publicar en otro hosting estático (Netlify, Cloudflare Pages, un dominio propio): `BASE_PATH=/ npm run build` y subir la carpeta `dist/`. Se necesita HTTPS (requisito del service worker y de WebCrypto).

## 7. Mantención

- **Actualizar dependencias:** `npm outdated`, actualizar, luego `npm run typecheck && npm test && npm run build && npm run test:e2e`. `npm audit` estaba en 0 vulnerabilidades al entregar.
- **Cambiar el nombre de la app:** variable `VITE_APP_NAME` al compilar (manifiesto, título) y, dentro de la app, *Ajustes › Perfil profesional* (documentos). Para la publicación automática, agregar `VITE_APP_NAME` como variable en el paso "Compilar para la ruta publicada".
- **Íconos:** `scripts/icon-source.mjs` y `npm run icons`.
- **Especies, rangos de referencia, medicamentos frecuentes, pautas de vacunación, plantillas, servicios y medios de pago:** se configuran dentro de la app (*Más › …*), no requieren cambios de código.
- **Publicar una versión:** push a la rama por defecto. La app instalada detecta la versión nueva y muestra "Actualizar"; la usuaria decide cuándo (se guardan antes los formularios abiertos).
- **Revisión periódica sugerida:** cambios normativos (Ley 21.719, recetas SAG), compatibilidad con la última versión de iOS y que el flujo de publicación siga en verde.

## 8. Desarrollo y pruebas

```bash
npm ci
npm run dev           # http://localhost:5173
npm run typecheck
npm test              # Vitest + fake-indexeddb (42 pruebas)
npm run build && npm run test:e2e        # Playwright con emulación de iPhone (requiere Chromium)
E2E_BASE_URL=https://isgrom1.github.io/DaniVet/ npm run test:e2e   # contra la URL publicada
```

Las pruebas E2E usan rutas relativas, por lo que funcionan en `/` y bajo `/DaniVet/`. En entornos sin descarga de navegadores se puede indicar el ejecutable con `PW_CHROMIUM_PATH`.

## 9. Evolución posible

- **Sincronización entre dispositivos / respaldo automático en la nube:** requeriría un servicio (por ejemplo Supabase con Row Level Security o almacenamiento de objetos) y cifrado de extremo a extremo con la DEK actual, para que el servidor solo vea datos cifrados. Implica costos y un contrato de tratamiento de datos.
- **Notificaciones push:** iOS 16.4+ las permite en PWA instaladas, pero necesitan un servidor de envío; además habría que cuidar que no muestren datos clínicos en la pantalla bloqueada.
- **App nativa (App Store):** requiere la cuenta de desarrollador de Apple.
- **Documentos tributarios:** integración con un proveedor de boleta de honorarios/factura electrónica del SII.
