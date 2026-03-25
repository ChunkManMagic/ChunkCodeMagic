import { useEffect, useRef, useCallback } from 'react';
import { get, set, del, keys } from 'idb-keyval';
import { STORAGE_KEYS } from '../constants';

/**
 * Persists a value to IndexedDB whenever it changes.
 * `isReady` gates writes so we don't overwrite data before the initial load.
 */
export function usePersistedState<T>(
  key: string,
  value: T,
  isReady: boolean,
): void {
  useEffect(() => {
    if (!isReady) return;
    set(key, value).catch(err =>
      console.error(`[usePersistedState] Failed to persist "${key}":`, err),
    );
  }, [key, value, isReady]);
}

/**
 * Loads a value from IndexedDB on mount.
 * Falls back to a localStorage copy for backwards compatibility with
 * the previous storage strategy, then migrates it to IndexedDB.
 */
export async function loadPersistedValue<T>(
  key: string,
  legacyLocalStorageKey?: string,
): Promise<T | undefined> {
  try {
    let value = await get<T>(key);

    // Legacy migration: pull from localStorage if not in IndexedDB yet
    if (value === undefined && legacyLocalStorageKey) {
      const raw = localStorage.getItem(legacyLocalStorageKey);
      if (raw) {
        try {
          value = JSON.parse(raw) as T;
          // Migrate to IndexedDB
          await set(key, value);
          localStorage.removeItem(legacyLocalStorageKey);
        } catch {
          // Corrupted localStorage entry — skip
        }
      }
    }

    return value;
  } catch (err) {
    console.error(`[loadPersistedValue] Failed to load "${key}":`, err);
    return undefined;
  }
}

/**
 * Removes IndexedDB entries for scenarios that haven't been updated in
 * `maxAgeMs` (default: 90 days). Runs once on mount.
 */
export function useStaleDataCleanup(
  scenarios: Array<{ id: string; lastUpdated: number }>,
  maxAgeDays = 90,
): void {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || scenarios.length === 0) return;
    ran.current = true;

    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const staleIds = scenarios
      .filter(s => now - s.lastUpdated > maxAgeMs)
      .map(s => s.id);

    if (staleIds.length === 0) return;

    (async () => {
      for (const id of staleIds) {
        await del(STORAGE_KEYS.SCENARIO_MESSAGES(id)).catch(() => {});
        await del(STORAGE_KEYS.SCENARIO_CODEX(id)).catch(() => {});
        await del(STORAGE_KEYS.SCENARIO_SUMMARY(id)).catch(() => {});
      }
      console.info(`[cleanup] Removed data for ${staleIds.length} stale scenario(s).`);
    })();
  }, [scenarios, maxAgeDays]);
}

/**
 * Returns a function that clears ALL personaforge IndexedDB keys.
 * Used for a "reset all data" nuclear option in settings.
 */
export function useClearAllData(): () => Promise<void> {
  return useCallback(async () => {
    try {
      const allKeys = await keys();
      const pfKeys = allKeys.filter(k => String(k).startsWith('personaforge'));
      await Promise.all(pfKeys.map(k => del(k)));
      // Also clear localStorage
      Object.keys(localStorage)
        .filter(k => k.startsWith('personaforge'))
        .forEach(k => localStorage.removeItem(k));
    } catch (err) {
      console.error('[useClearAllData] Failed:', err);
    }
  }, []);
}
