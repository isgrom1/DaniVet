import { useEffect, useState } from 'react';
import { getMeta } from './idb';

/** Lee un valor técnico no sensible (p. ej. fecha del último respaldo). */
export function useMeta<T>(key: string, deps: unknown[] = []): T | undefined {
  const [v, setV] = useState<T | undefined>();
  useEffect(() => {
    let alive = true;
    void getMeta<T>(key).then((x) => alive && setV(x));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);
  return v;
}
