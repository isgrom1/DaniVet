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
