import { useEffect, useCallback, useRef } from 'react';
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

export function useStaleDataCleanup(scenarios: Scenario[], isReady: boolean, maxAgeDays = 90) {
  // Use a ref to always have the latest scenarios without triggering the useEffect
  const scenariosRef = useRef(scenarios);

  useEffect(() => {
    scenariosRef.current = scenarios;
  }, [scenarios]);

  const hasCleanedRef = useRef(false);

  useEffect(() => {
    if (!isReady || hasCleanedRef.current) return;
    hasCleanedRef.current = true;

    const cleanup = async () => {
      try {
        const allKeys = await keys();
        const currentScenarios = scenariosRef.current;
        const now = Date.now();
        const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

        // O(1) set lookup instead of O(N) linear scan in a loop
        const validScenarioIds = new Set(currentScenarios.map(s => s.id));
        const scenarioAgeMap = new Map(currentScenarios.map(s => [s.id, now - (s.lastUpdated || 0)]));

        for (const key of allKeys) {
          if (typeof key === 'string' && key.startsWith('personaforge_')) {
            const parts = key.split('_');
            if (parts.length >= 3) {
              const scenarioId = parts[2];
              
              const hasScenario = validScenarioIds.has(scenarioId);
              const age = scenarioAgeMap.get(scenarioId) ?? Infinity;
              if (!hasScenario || age > maxAgeMs) {
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
  }, [isReady, maxAgeDays]);
}