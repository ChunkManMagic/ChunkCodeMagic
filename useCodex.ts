import { useState, useEffect, useCallback } from 'react';
import { get, set } from 'idb-keyval';
import { extractCodexEntries, refineCodexEntry, generateId } from '../lib/gemini';
import type { CharacterProfile, CodexEntry, Message } from '../lib/types';
import { STORAGE_KEYS } from '../constants';

interface UseCodexOptions {
  scenarioId: string;
  profile: CharacterProfile;
  messages: Message[];
  isReady: boolean;
}

export function useCodex({ scenarioId, profile, messages, isReady }: UseCodexOptions) {
  const [codexEntries, setCodexEntries] = useState<CodexEntry[]>([]);
  const [isAutoCodexEnabled, setIsAutoCodexEnabled] = useState(false);
  const [isAutoPopulating, setIsAutoPopulating] = useState(false);

  // ── Load from IndexedDB ──────────────────────────────────
  useEffect(() => {
    get<CodexEntry[]>(STORAGE_KEYS.SCENARIO_CODEX(scenarioId)).then(saved => {
      if (saved) setCodexEntries(saved);
    });
  }, [scenarioId]);

  // ── Persist on change ────────────────────────────────────
  useEffect(() => {
    if (!isReady) return;
    set(STORAGE_KEYS.SCENARIO_CODEX(scenarioId), codexEntries).catch(() => {});
  }, [codexEntries, scenarioId, isReady]);

  // ── Auto-populate after every 3 model messages ───────────
  const autoPopulate = useCallback(
    async (force = false) => {
      if (isAutoPopulating || messages.length < 2) return;
      if (!force && (!isAutoCodexEnabled || messages.length % 3 !== 0)) return;

      setIsAutoPopulating(true);
      try {
        const history = messages.map(m => ({ role: m.role, text: m.text }));
        const newEntries = await extractCodexEntries(history, profile, codexEntries);
        if (newEntries.length > 0) {
          const withIds: CodexEntry[] = newEntries.map(e => ({
            ...e,
            id: generateId(),
          } as CodexEntry));
          setCodexEntries(prev => [...prev, ...withIds]);
        }
      } catch (e) {
        console.error('[useCodex] Auto-populate failed:', e);
      } finally {
        setIsAutoPopulating(false);
      }
    },
    [isAutoPopulating, isAutoCodexEnabled, messages, profile, codexEntries],
  );

  // ── Add / update / delete entries ────────────────────────
  const addEntry = useCallback((entry: Omit<CodexEntry, 'id'>) => {
    setCodexEntries(prev => [...prev, { ...entry, id: generateId() }]);
  }, []);

  const updateEntry = useCallback((id: string, updates: Partial<CodexEntry>) => {
    setCodexEntries(prev =>
      prev.map(e => (e.id === id ? { ...e, ...updates } : e)),
    );
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setCodexEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const refineEntry = useCallback(
    async (entry: Partial<CodexEntry>): Promise<Partial<CodexEntry>> => {
      return refineCodexEntry(entry, profile);
    },
    [profile],
  );

  const resetCodex = useCallback(() => setCodexEntries([]), []);

  return {
    codexEntries,
    setCodexEntries,
    isAutoCodexEnabled,
    setIsAutoCodexEnabled,
    isAutoPopulating,
    autoPopulate,
    addEntry,
    updateEntry,
    deleteEntry,
    refineEntry,
    resetCodex,
  };
}
