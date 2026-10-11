export function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** Devuelve una copia de `obj` con `path` = `value` (rutas con puntos). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const clone = (Array.isArray(obj) ? [...obj] : { ...(obj as object) }) as Record<string, unknown>;
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = cur[k];
    cur[k] = next && typeof next === 'object' ? (Array.isArray(next) ? [...next] : { ...(next as object) }) : {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return clone as T;
}

/** Quita propiedades con texto vacío o undefined (para no guardar campos en blanco). */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out as T;
}

export function emptyToUndef(s: string | undefined | null): string | undefined {
  const t = (s ?? '').trim();
  return t ? t : undefined;
}
