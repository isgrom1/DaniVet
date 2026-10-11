import { useDataStore, type Tables } from './store';
import type { Profile, Settings } from './schema';
import { defaultSettings } from './defaults';

export function useTables(): Tables {
  return useDataStore((s) => s.tables);
}

export function useProfile(): Profile | undefined {
  return useDataStore((s) => s.tables.profile.get('profile'));
}

const fallbackSettings = { ...defaultSettings(), createdAt: '', updatedAt: '', rev: 1 } as Settings;

export function useSettings(): Settings {
  return useDataStore((s) => s.tables.settings.get('settings')) ?? fallbackSettings;
}
