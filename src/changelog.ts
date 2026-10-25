/**
 * Novedades visibles para quien usa la app (la más reciente primero).
 * En cada publicación con cambios visibles: sube la versión en package.json y agrega aquí una entrada
 * con frases cortas, en español y sin tecnicismos. La app las muestra una vez después de actualizarse.
 */
export interface Release {
  version: string;
  /** Fecha de publicación (AAAA-MM-DD). */
  date: string;
  items: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: '1.4.0',
    date: '2026-10-25',
    items: [
      'Indicaciones con formato: en «Cuidados domiciliarios» y «Recomendaciones al tutor» hay una barra para agregar subtítulos, negritas, viñetas y tablas (por ejemplo, la transición de alimento día por día). Así se ven en el PDF.',
      'Varios pacientes en las mismas indicaciones: al tocar «Indicaciones al tutor» puedes incluir a otros pacientes del mismo tutor. El PDF los muestra en una tabla con el peso de cada uno.',
      'El PDF de indicaciones ahora muestra el peso del paciente.',
      'Lo mismo en Documentos › Indicaciones posteriores a la atención: barra de formato y opción «También para».',
      'Al escribir en una ventana emergente durante la consulta (por ejemplo, la calculadora de dosis o una tabla), el cursor ya no salta al primer campo cuando la consulta se guarda sola.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-21',
    items: [
      'Nuevo y opcional: lectura de informes con IA. En «Valores del examen» toca «Leer foto o PDF con IA», elige la foto o el PDF del informe y Claude transcribe los resultados para que los revises antes de agregarlos.',
      'Viene desactivada. Se activa en Más › Lectura de informes con IA con tu propia clave de Claude, que se guarda cifrada en este teléfono.',
      'Solo se envía la foto o el PDF que elijas, y únicamente cuando tocas «Leer con IA».',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-10-18',
    items: [
      'Valores de exámenes: al pegar el texto de un informe (copiado de una foto o PDF en el iPhone) ahora se toman también la unidad y el rango de referencia de cada línea, y se reconocen nombres como «ALT (GPT)».',
      'Las líneas del informe que no se reconocen se muestran aparte, en vez de quedar como nota del valor anterior.',
      'En «Dictar o pegar» se explica cómo copiar el texto de una foto o PDF del informe.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-18',
    items: [
      'Dictado de la consulta: toca «Dictar la consulta» y habla con el micrófono del teclado. La app ubica cada dato en la ficha (motivo, examen físico, diagnóstico, tratamiento y control); tú eliges qué agregar y lo dictado queda marcado para revisar.',
      'Aviso de datos importantes sin registrar (peso, temperatura, mucosas, diagnóstico y otros) mientras completas la consulta y al finalizarla.',
      'Valores de exámenes: ingresa los valores del informe (hemograma, bioquímica, electrolitos, orina y endocrino), escribiéndolos o dictándolos, con el rango que informa el laboratorio.',
      'En la ficha del paciente, Exámenes › Evolución de valores: tabla para comparar exámenes, filtros y un gráfico de cada valor.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-11',
    items: [
      'La app se actualiza sola: al abrirla (o cuando se bloquea) instala la versión nueva sin que pierdas nada.',
      'Nuevo: Más › Sugerir un cambio o reportar un problema, para enviarlo por WhatsApp o correo.',
      'En Más › Acerca de la app puedes buscar actualizaciones y ver las novedades de cada versión.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-11',
    items: ['Primera versión publicada.'],
  },
];

/** Compara versiones "1.2.3". Devuelve un número negativo, cero o positivo. Las versiones no numéricas valen 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const isVersion = (v: string) => /^\d+(\.\d+)*$/.test(v);

/** Versiones publicadas después de `seen` y hasta `current` (inclusive), de la más reciente a la más antigua. */
export function releasesSince(seen: string, current: string, list: Release[] = CHANGELOG): Release[] {
  if (!isVersion(seen) || !isVersion(current)) return [];
  return list.filter((r) => compareVersions(r.version, seen) > 0 && compareVersions(r.version, current) <= 0);
}
