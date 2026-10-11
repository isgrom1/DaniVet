import type { TableName } from './schema';

/**
 * Versión del modelo de datos que guarda la app (en el dispositivo y en cada respaldo).
 *
 * Para cambiar la forma de un registro en una versión futura:
 *  1. Sube DATA_VERSION (por ejemplo, a 2).
 *  2. Agrega a MIGRATIONS una migración con `to: 2` que transforme los registros antiguos.
 *  3. Ajusta el esquema en schema.ts y agrega una prueba en migrations.test.ts.
 * Las migraciones se aplican al desbloquear (también después de restaurar un respaldo antiguo),
 * en orden, una sola vez, y los registros modificados se vuelven a guardar cifrados.
 * Agregar campos opcionales no requiere migración: los esquemas aceptan registros sin ellos.
 */
export const DATA_VERSION = 1;

export const DATA_VERSION_KEY = 'dataVersion';

/** Registros ya descifrados, por tabla (se modifican en el lugar). */
export type RawTables = Record<TableName, Map<string, Record<string, unknown>>>;

export interface Migration {
  /** Versión que deja el modelo después de aplicarla. */
  to: number;
  description: string;
  /** Transforma los registros en memoria y devuelve los que cambiaron. */
  run(tables: RawTables): Array<{ table: TableName; id: string }>;
}

export const MIGRATIONS: Migration[] = [
  // Ejemplo de una migración futura:
  // {
  //   to: 2,
  //   description: 'Normaliza los correos de los tutores en minúsculas',
  //   run: (t) =>
  //     [...t.tutors.values()].flatMap((r) => (typeof r.email === 'string' ? ((r.email = r.email.toLowerCase()), [{ table: 'tutors' as const, id: String(r.id) }]) : [])),
  // },
];

let registry = { version: DATA_VERSION, list: MIGRATIONS };

export function currentDataVersion(): number {
  return registry.version;
}

export function migrationsFrom(from: number): Migration[] {
  return registry.list.filter((m) => m.to > from && m.to <= registry.version).sort((a, b) => a.to - b.to);
}

/** Solo para pruebas: simula una versión de la app con otras migraciones. */
export function setMigrationsForTests(version: number, list: Migration[]): void {
  registry = { version, list };
}

export function resetMigrationsForTests(): void {
  registry = { version: DATA_VERSION, list: MIGRATIONS };
}
