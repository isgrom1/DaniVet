import { useEffect, useState } from 'react';
import { getDek, hasDek } from '@/data/vaultKey';
import { openJson, sealJson, type Sealed } from '@/lib/crypto';
import { deleteMeta, getMeta, setMeta } from '@/lib/idb';

/**
 * Clave de la API de Claude que ingresa la profesional para leer informes con IA.
 * Se guarda cifrada con la clave de la bóveda y aparte de los registros: no entra en respaldos ni exportaciones,
 * y se borra con "Eliminar todos los datos" o al restaurar un respaldo.
 */
const META_KEY = 'aiKey';
const AAD = 'vetcasa:meta:aiKey';

export interface AiConfig {
  key: string;
  /** Cuándo la profesional aceptó que las fotos o PDF que elija se envíen a Anthropic. */
  consentAt: string;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export async function loadAiConfig(): Promise<AiConfig | null> {
  if (!hasDek()) return null;
  const sealed = await getMeta<Sealed>(META_KEY);
  if (!sealed) return null;
  try {
    return await openJson<AiConfig>(getDek(), AAD, sealed);
  } catch {
    // Cifrada con otra bóveda: se ignora y la profesional vuelve a ingresarla.
    return null;
  }
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  await setMeta(META_KEY, await sealJson(getDek(), AAD, config));
  notify();
}

export async function clearAiConfig(): Promise<void> {
  await deleteMeta(META_KEY);
  notify();
}

/** Las claves de la API de Anthropic empiezan con "sk-ant-". */
export const looksLikeApiKey = (s: string) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(s.trim());

/** Para reconocer la clave sin mostrarla. */
export const keyHint = (key: string) => `…${key.slice(-4)}`;

/** Configuración actual: undefined mientras se lee, null si la lectura con IA no está activada. */
export function useAiConfig(): AiConfig | null | undefined {
  const [config, setConfig] = useState<AiConfig | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void loadAiConfig().then(
        (c) => alive && setConfig(c),
        () => alive && setConfig(null),
      );
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, []);
  return config;
}
