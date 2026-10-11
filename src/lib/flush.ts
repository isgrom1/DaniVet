/**
 * Guardado pendiente antes de bloquear o recargar: los formularios con autoguardado registran aquí
 * su función para persistir los cambios inmediatamente.
 */
const handlers = new Set<() => Promise<void> | void>();

export function registerFlush(fn: () => Promise<void> | void): () => void {
  handlers.add(fn);
  return () => handlers.delete(fn);
}

export async function flushAll(timeoutMs = 2500): Promise<void> {
  const all = Promise.allSettled([...handlers].map((h) => Promise.resolve().then(h)));
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
}
