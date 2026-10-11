import { create } from 'zustand';
import { useMemo } from 'react';
import { TABLES, type EntityOf, type TableName } from './schema';

/**
 * Copia descifrada de los datos en memoria, disponible solo mientras la bóveda está desbloqueada.
 * Al bloquear se descarta por completo.
 */
export type Tables = { [K in TableName]: Map<string, EntityOf<K>> };

export type VaultStatus = 'checking' | 'none' | 'locked' | 'loading' | 'ready';

export interface DataState {
  status: VaultStatus;
  tables: Tables;
  /** Registros que no pudieron leerse (descifrado o validación). Se informa en Ajustes > Almacenamiento. */
  loadIssues: number;
}

export function emptyTables(): Tables {
  const t = {} as Record<TableName, Map<string, unknown>>;
  for (const name of TABLES) t[name] = new Map();
  return t as Tables;
}

export const useDataStore = create<DataState>(() => ({ status: 'checking', tables: emptyTables(), loadIssues: 0 }));

export function getTable<T extends TableName>(t: T): Map<string, EntityOf<T>> {
  return useDataStore.getState().tables[t];
}

export function getRecord<T extends TableName>(t: T, id: string | undefined | null): EntityOf<T> | undefined {
  if (!id) return undefined;
  return useDataStore.getState().tables[t].get(id);
}

export function allOf<T extends TableName>(t: T): EntityOf<T>[] {
  return [...useDataStore.getState().tables[t].values()];
}

export function useTable<T extends TableName>(t: T): Map<string, EntityOf<T>> {
  return useDataStore((s) => s.tables[t]) as Map<string, EntityOf<T>>;
}

export function useRecord<T extends TableName>(t: T, id: string | undefined | null): EntityOf<T> | undefined {
  return useDataStore((s) => (id ? (s.tables[t].get(id) as EntityOf<T> | undefined) : undefined));
}

/** Lista derivada y memorizada de una tabla. */
export function useList<T extends TableName, R = EntityOf<T>>(
  t: T,
  select: (rows: EntityOf<T>[]) => R[],
  deps: unknown[] = [],
): R[] {
  const map = useTable(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => select([...map.values()]), [map, ...deps]);
}

export function applyChanges(puts: Array<{ table: TableName; record: { id: string } }>, deletes: Array<{ table: TableName; id: string }>) {
  useDataStore.setState((s) => {
    const tables = { ...s.tables };
    const touched = new Set<TableName>();
    for (const p of puts) touched.add(p.table);
    for (const d of deletes) touched.add(d.table);
    for (const t of touched) (tables as Record<TableName, Map<string, unknown>>)[t] = new Map(s.tables[t] as Map<string, unknown>);
    for (const p of puts) (tables[p.table] as Map<string, unknown>).set(p.record.id, p.record);
    for (const d of deletes) (tables[d.table] as Map<string, unknown>).delete(d.id);
    return { tables };
  });
}
