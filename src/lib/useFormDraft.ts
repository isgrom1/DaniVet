import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecord } from '@/data/store';
import { remove, upsert } from '@/data/repo';
import { registerFlush } from './flush';
import { setPath } from './objects';

/** Guarda el borrador de un formulario (cifrado, como todo lo demás) para no perder datos si la app se cierra. */
async function saveDraft(key: string, data: unknown) {
  try {
    await upsert('drafts', key, { data }, { audit: false });
  } catch {
    /* si la app está bloqueada no se guarda el borrador */
  }
}

export async function clearDraft(key: string) {
  if (getRecord('drafts', key)) {
    try {
      await remove('drafts', key, { audit: false });
    } catch {
      /* ignorar */
    }
  }
}

export function useFormDraft<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(initial);
  const [restorable, setRestorable] = useState<{ data: T; at: string } | null>(() => {
    const d = getRecord('drafts', key);
    return d ? { data: d.data as T, at: d.updatedAt } : null;
  });
  const dirty = useRef(false);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void saveDraft(key, value), 700);
    return () => clearTimeout(t);
  }, [key, value]);

  useEffect(
    () =>
      registerFlush(async () => {
        if (dirty.current) await saveDraft(key, latest.current);
      }),
    [key],
  );

  const set = useCallback((updater: T | ((prev: T) => T)) => {
    dirty.current = true;
    setValue(updater);
  }, []);

  const setField = useCallback((path: string, v: unknown) => {
    dirty.current = true;
    setValue((prev) => setPath(prev, path, v));
  }, []);

  const restore = useCallback(() => {
    if (!restorable) return;
    dirty.current = true;
    setValue(restorable.data);
    setRestorable(null);
  }, [restorable]);

  const discardDraft = useCallback(async () => {
    setRestorable(null);
    await clearDraft(key);
  }, [key]);

  /** Llamar tras guardar el formulario con éxito. */
  const done = useCallback(async () => {
    dirty.current = false;
    await clearDraft(key);
  }, [key]);

  return { value, set, setField, restorable, restore, discardDraft, done, isDirty: () => dirty.current };
}
