import { useEffect, useCallback } from 'react';
import { get, set, del, keys } from 'idb-keyval';
import { Scenario } from '../lib/types';

export function useStorage() {
  const loadData = useCallback(async <T>(key: string): Promise<T | null> => {
    try {
      const val = await get<T>(key);
      return val !== undefined ? val : null;
    } catch (e) {
      console.error(`Failed to load data for ${key}`, e);
      return null;
    }
  }, []);

  const saveData = useCallback(async <T>(key: string, value: T): Promise<void> => {
    try {
      await set(key, value);
    } catch (e) {
      console.error(`Failed to save data for ${key}`, e);
    }
  }, []);

  const deleteData = useCallback(async (key: string): Promise<void> => {
    try {
      await del(key);
    } catch (e) {
      console.error(`Failed to delete data for ${key}`, e);
    }
  }, []);

  return { loadData, saveData, deleteData };
}

export function useStaleDataCleanup(scenarios: Scenario[], maxAgeDays = 90) {
  useEffect(() => {
    const cleanup = async () => {
      try {
        const allKeys = await keys();

        const now = Date.now();
        const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

        for (const key of allKeys) {
          if (typeof key === 'string' && key.startsWith('personaforge_')) {
            const parts = key.split('_');
            if (parts.length >= 3) {
              const scenarioId = parts[2];
              
              const scenario = scenarios.find(s => s.id === scenarioId);
              if (!scenario || (now - scenario.lastUpdated > maxAgeMs)) {
                await del(key);
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to cleanup stale data', e);
      }
    };
    
    cleanup();
  }, [scenarios, maxAgeDays]);
}
