# Respaldo y recuperación

VetCasa no guarda nada en servidores: **el teléfono es la única copia** de los datos hasta que se crea un respaldo. Este documento explica cómo respaldar, comprobar y restaurar, y qué hacer en cada situación.

## Qué contiene un respaldo `.vetcasa`

- Es un archivo ZIP con:
  - `manifest.json`: fecha, versión de la app y del modelo de datos, cantidad de registros y la **cabecera de la bóveda** (la clave de datos envuelta con la contraseña y con la clave de recuperación; nunca la clave en claro).
  - `records.json`: todos los registros **tal como están guardados en el teléfono, cifrados** con AES-256-GCM.
  - `blobs/*.bin`: fotos y documentos adjuntos, también cifrados (solo si se marcó "Incluir fotos y documentos adjuntos").
  - Una suma **SHA-256** de `records.json` para detectar archivos dañados o modificados.
- Sin la contraseña vigente al crear el respaldo **o** la clave de recuperación, el contenido no se puede leer.
- No incluye los borradores de formularios sin guardar.

## Crear un respaldo (recomendado: cada semana y antes de actualizar o cambiar de teléfono)

1. **Más › Respaldo, exportación y restauración**.
2. Decide si incluir fotos y documentos adjuntos (el archivo será más grande).
3. **Crear respaldo cifrado** → **Guardar o compartir el archivo**.
4. En el iPhone elige **Guardar en Archivos** (idealmente en **iCloud Drive** u otra nube) o envíalo a tu correo. Así queda una copia **fuera del teléfono**.

La pantalla de Inicio recuerda cuándo fue el último respaldo y avisa si no hay ninguno.

## Comprobar un respaldo sin tocar los datos actuales

**Más › Respaldo… › Verificar un respaldo** → elegir el archivo → ingresar la contraseña o la clave de recuperación → **Verificar**.
La app descifra todo en memoria y muestra cuántos registros y archivos se pueden recuperar. No modifica nada.

## Restaurar

> Restaurar **reemplaza todos los datos** del dispositivo por los del respaldo.

- **En un teléfono nuevo o después de reinstalar:** instala la app (ver la [guía](guia-usuaria.md)), y en la bienvenida toca **Restaurar desde un respaldo**. Elige el archivo e ingresa:
  - la **contraseña vigente cuando se creó el respaldo**, o
  - la **clave de recuperación** y una contraseña nueva para ese dispositivo.
- **En el mismo teléfono (con la cuenta abierta):** **Más › Respaldo… › Restaurar desde un respaldo**.
- Si el respaldo es de una versión anterior de la app, los datos se actualizan automáticamente al abrirlos. Un respaldo creado con una versión **más nueva** no se abre en una versión antigua: la app pide actualizarse primero.

## Situaciones frecuentes

| Situación | Qué hacer |
| --- | --- |
| Olvidé la contraseña | En la pantalla de desbloqueo: **Olvidé mi contraseña** → clave de recuperación → contraseña nueva. Los datos se conservan. |
| Olvidé la contraseña y perdí la clave de recuperación | Los datos del teléfono **no se pueden recuperar** (están cifrados y no existe una "llave maestra"). Si tienes un respaldo y recuerdas la contraseña que tenías cuando lo creaste, puedes restaurarlo. |
| Perdí o me robaron el teléfono | Los datos están cifrados en ese teléfono. En el teléfono nuevo, restaura el último respaldo. Lo registrado después de ese respaldo se pierde. |
| Cambio de teléfono | Crea un respaldo en el antiguo y guárdalo en iCloud Drive o envíatelo. En el nuevo, instala la app y elige **Restaurar desde un respaldo**. |
| El respaldo dice "dañado" | El archivo se modificó o se copió incompleto. Usa otro respaldo. Por eso conviene guardar varios. |
| Cambié la contraseña | Los respaldos antiguos se abren con la contraseña **que había al crearlos** o con la clave de recuperación. Crea un respaldo nuevo después de cambiarla. |
| Generé una clave de recuperación nueva | La anterior deja de servir para los datos del teléfono, pero **sigue abriendo los respaldos creados antes**. Guarda ambas o crea un respaldo nuevo. |

## Exportación abierta (para migrar a otro sistema)

**Más › Respaldo… › Exportar todos los datos (sin cifrar)** genera un ZIP **legible sin contraseña**:

- `datos/<tabla>.json`: todos los registros con sus identificadores, de modo que las relaciones se conservan (por ejemplo, `patients.tutors[].tutorId → tutors.id`, `consultations.patientId → patients.id`, `payments.chargeId → charges.id`). El archivo `LEEME.txt` incluido describe todas las relaciones.
- `csv/*.csv`: resúmenes para planillas (separador `;`, con protección contra fórmulas).
- `adjuntos/`: fotos y documentos.
- `info.json`: versión de la app y del modelo de datos.

Por contener datos personales y clínicos en claro, exige volver a ingresar la contraseña y queda anotada en el historial de cambios. Úsala solo cuando sea necesario y elimina el archivo después.

## Procedimiento verificado

El ciclo completo (crear respaldo → comprobar que no contiene texto legible → verificar con contraseña incorrecta y correcta → restaurar en otro "teléfono" vacío → comprobar pacientes, tutores, consultas, recetas y archivos) se ejecuta en las pruebas automáticas (`src/features/backup/backup.test.ts`, `src/data/migrations.test.ts` y el paso 19 de `e2e/acceptance.spec.ts`). Ver [resultados](pruebas.md).
