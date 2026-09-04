import { useState, useEffect, useCallback } from 'react';
import { CodexEntry, CharacterProfile, Message } from '../lib/types';
import { extractCodexEntries, refineCodexEntry, generateCodexImage } from '../lib/gemini';
import { useStorage } from './useStorage';
import { STORAGE_KEYS } from '../constants';
import { generateId } from '../lib/gemini';
import { useToast } from './useToast';
import { useFirestoreSync } from './useFirestoreSync';

export function useCodex(scenarioId: string, profile: CharacterProfile, messages: Message[]) {
  const [codexEntries, setCodexEntries] = useState<CodexEntry[]>([]);
  const [isAutoPopulatingCodex, setIsAutoPopulatingCodex] = useState(false);
  const [isAutoCodexEnabled, setIsAutoCodexEnabled] = useState(false);
  const [isRefiningCodexEntry, setIsRefiningCodexEntry] = useState(false);
  const [isGeneratingCodexImage, setIsGeneratingCodexImage] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const { loadData, saveData } = useStorage();
  const { toastSuccess, toastError } = useToast();
  const { user, isAuthReady, syncCodex, saveCodexEntry, saveCodexEntriesBatch } = useFirestoreSync();

  useEffect(() => {
    const loadCodexData = async () => {
      try {
        const savedCodex = await loadData<CodexEntry[]>(STORAGE_KEYS.SCENARIO_CODEX(scenarioId));
        if (savedCodex) {
          setCodexEntries(savedCodex);
        }
      } catch (e) {
        console.error("Failed to load codex data", e);
      } finally {
        if (!user) setIsLoaded(true);
      }
    };
    loadCodexData();
  }, [scenarioId, loadData, user]);

  // Sync from Firestore if logged in
  useEffect(() => {
    if (isAuthReady && user && scenarioId) {
      const unsubscribe = syncCodex(scenarioId, async (syncedEntries) => {
        setCodexEntries(syncedEntries);

        // Migrate local codex
        try {
          const migratedFlag = localStorage.getItem(`migrated_codex_${scenarioId}_${user.uid}`);
          if (!migratedFlag) {
            localStorage.setItem(`migrated_codex_${scenarioId}_${user.uid}`, 'true');
            const savedCodex = await loadData<CodexEntry[]>(STORAGE_KEYS.SCENARIO_CODEX(scenarioId));
            if (savedCodex && savedCodex.length > 0) {
              console.log("Migrating local codex to Firestore...");
              await saveCodexEntriesBatch(scenarioId, savedCodex);
            }
          }
        } catch (e) {}

        setIsLoaded(true);
      });
      return () => unsubscribe();
    }
  }, [isAuthReady, user, scenarioId, syncCodex, loadData, saveCodexEntriesBatch]);

  useEffect(() => {
    if (isLoaded) {
      saveData(STORAGE_KEYS.SCENARIO_CODEX(scenarioId), codexEntries);
    }
  }, [codexEntries, scenarioId, isLoaded, saveData]);

  const addCodexEntry = useCallback(async (entry: CodexEntry) => {
    setCodexEntries(prev => [...prev, entry]);
    if (user) {
      await saveCodexEntry(scenarioId, entry);
    }
  }, [user, scenarioId, saveCodexEntry]);

  const addCodexEntriesBatch = useCallback(async (entries: CodexEntry[]) => {
    setCodexEntries(prev => [...prev, ...entries]);
    if (user) {
      await saveCodexEntriesBatch(scenarioId, entries);
    }
  }, [user, scenarioId, saveCodexEntriesBatch]);

  const scanSilentLore = useCallback((text: string) => {
    if (!text || text.length < 15) return;
    const existingTitles = new Set(codexEntries.map(e => e.title.toLowerCase().trim()));
    const newItems: CodexEntry[] = [];

    // 1. Detect Locations: "in/at/near/to the [Capitalized Place]", "the [Name] Kingdom/Tower/Castle/Forest/Tavern/City/Ruins/Sanctuary"
    const locationRegex = /\b(?:in|at|near|to|through|inside|into)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:Tavern|Inn|Castle|Keep|Tower|Forest|Woods|City|Ruins|Sanctuary|Citadel|Palace|Temple|Dungeon|Kingdom|Valley|River|Mountain|Peak|Gate|Square|Harbor))/g;
    let match: RegExpExecArray | null;
    while ((match = locationRegex.exec(text)) !== null) {
      const title = match[1].trim();
      if (title && !existingTitles.has(title.toLowerCase()) && !newItems.some(i => i.title.toLowerCase() === title.toLowerCase())) {
        existingTitles.add(title.toLowerCase());
        newItems.push({
          id: generateId(),
          title,
          category: 'Location',
          content: `Discovered location mentioned in dialogue: "${title}".`
        });
      }
    }

    // 2. Detect Factions & Organizations: "the [Capitalized Words] Guild/Order/Syndicate/Clan/Brotherhood/Empire/Guard/Cabal"
    const factionRegex = /\b(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:Guild|Order|Syndicate|Clan|Brotherhood|Empire|Guard|Cabal|Cult|Faction|Fleet|Legion|Alliance))/g;
    while ((match = factionRegex.exec(text)) !== null) {
      const title = match[1].trim();
      if (title && !existingTitles.has(title.toLowerCase()) && !newItems.some(i => i.title.toLowerCase() === title.toLowerCase())) {
        existingTitles.add(title.toLowerCase());
        newItems.push({
          id: generateId(),
          title,
          category: 'Lore',
          content: `Organization or faction referenced in the narrative: "${title}".`
        });
      }
    }

    // 3. Detect Named Characters / Entities: "[Name] the [Epithet]" or "Lord/Lady/Captain/Archmage [Name]"
    const titleRegex = /\b((?:Lord|Lady|Captain|Archmage|Professor|King|Queen|Master|Commander|Doctor|Baron|Count|Prince|Princess)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    while ((match = titleRegex.exec(text)) !== null) {
      const title = match[1].trim();
      if (title && !existingTitles.has(title.toLowerCase()) && !newItems.some(i => i.title.toLowerCase() === title.toLowerCase()) && title.toLowerCase() !== profile.name.toLowerCase()) {
        existingTitles.add(title.toLowerCase());
        newItems.push({
          id: generateId(),
          title,
          category: 'Lore',
          content: `Person of significance encountered: "${title}".`
        });
      }
    }

    if (newItems.length > 0) {
      addCodexEntriesBatch(newItems);
      toastSuccess(`Codex updated: ${newItems.map(i => i.title).join(', ')}`);
    }
  }, [codexEntries, profile.name, addCodexEntriesBatch, toastSuccess]);

  const handleAutoPopulateCodex = useCallback(async (force = false, historyOverride?: { role: string; parts: { text: string }[] }[]) => {
    const currentHistory = historyOverride || messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    if (isAutoPopulatingCodex || currentHistory.length < 2) return;

    // First run local zero-cost silent scanner on the latest turn
    const latestMessageText = messages[messages.length - 1]?.text || '';
    scanSilentLore(latestMessageText);

    if (!force && (!isAutoCodexEnabled || currentHistory.length % 12 !== 0)) return;
    
    setIsAutoPopulatingCodex(true);
    try {
      const newEntries = await extractCodexEntries(currentHistory, profile, codexEntries);
      
      if (newEntries.length > 0) {
        const entriesWithIds: CodexEntry[] = newEntries.map(e => ({
          ...e,
          id: generateId(),
        } as CodexEntry));
        
        await addCodexEntriesBatch(entriesWithIds);
        toastSuccess(`Added ${newEntries.length} new codex entries`);
      } else if (force) {
        toastSuccess("No new codex entries found");
      }
    } catch (err: any) {
      console.error("Auto-populate codex failed", err);
      if (force) {
        toastError(`Failed to extract codex entries: ${err.message || 'Unknown error'}`);
      }
    } finally {
      setIsAutoPopulatingCodex(false);
    }
  }, [messages, profile, codexEntries, isAutoPopulatingCodex, isAutoCodexEnabled, toastSuccess, toastError, addCodexEntriesBatch, scanSilentLore]);

  const handleRefineCodexEntry = useCallback(async (entry: Partial<CodexEntry>) => {
    if (isRefiningCodexEntry || !entry.title || !entry.content) return entry;
    setIsRefiningCodexEntry(true);
    try {
      const refined = await refineCodexEntry(entry, profile);
      toastSuccess(`Refined ${entry.title}`);
      return refined;
    } catch (err: any) {
      console.error("Refine codex entry failed", err);
      toastError(`Refinement failed: ${err.message || 'Unknown error'}`);
      return entry;
    } finally {
      setIsRefiningCodexEntry(false);
    }
  }, [isRefiningCodexEntry, profile, toastSuccess, toastError]);

  const handleGenerateCodexImage = useCallback(async (entry: CodexEntry) => {
    setIsGeneratingCodexImage(entry.id);
    try {
      const imageUrl = await generateCodexImage(entry, profile);
      if (imageUrl) {
        const updatedEntry = { ...entry, imageUrl };
        setCodexEntries(prev => prev.map(e => e.id === entry.id ? updatedEntry : e));
        if (user) {
          await saveCodexEntry(scenarioId, updatedEntry);
        }
        toastSuccess(`Generated image for ${entry.title}`);
      }
    } catch (err: any) {
      console.error("Generate codex image failed", err);
      toastError(`Image generation failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingCodexImage(null);
    }
  }, [profile, toastSuccess, toastError, user, scenarioId, saveCodexEntry]);

  return {
    codexEntries,
    setCodexEntries,
    addCodexEntry,
    isAutoPopulatingCodex,
    isAutoCodexEnabled,
    setIsAutoCodexEnabled,
    isRefiningCodexEntry,
    isGeneratingCodexImage,
    handleAutoPopulateCodex,
    handleRefineCodexEntry,
    handleGenerateCodexImage,
    isLoaded
  };
}
