import { useState, useEffect, useRef, useCallback } from 'react';
import { get, set } from 'idb-keyval';
import { Message } from '../lib/types';
import { STORAGE_KEYS } from '../constants';
import { useFirestoreSync } from './useFirestoreSync';

export function useChatState(scenarioId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [storySummary, setStorySummary] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { user, isAuthReady, syncMessages, saveMessage, saveMessagesBatch, deleteMessage: cloudDeleteMessage, deleteMessagesBatch, syncSummary, saveSummary } = useFirestoreSync();

  // Load initial data from local storage
  useEffect(() => {
    const loadLocalData = async () => {
      try {
        // Load Messages
        let saved = await get(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId));
        if (!saved) {
          const localSaved = localStorage.getItem(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId));
          if (localSaved) {
            saved = JSON.parse(localSaved);
            await set(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId), saved);
          }
        }
        if (saved) {
          const seen = new Set();
          const clean = saved.filter((m: any) => {
            if (!m.id || seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });
          setMessages(clean);
        }

        // Load Summary
        const savedSummary = await get(STORAGE_KEYS.SCENARIO_SUMMARY(scenarioId));
        if (savedSummary) {
          setStorySummary(savedSummary);
        }
      } catch (e) {
        console.error("Failed to load local data", e);
      } finally {
        if (!user) setIsLoaded(true);
      }
    };
    loadLocalData();
  }, [scenarioId, user]);

  // Sync from Firestore if logged in
  useEffect(() => {
    if (isAuthReady && user && scenarioId) {
      const unsubMessages = syncMessages(scenarioId, async (syncedMessages) => {
        if (syncedMessages.length > 0) {
          setMessages(syncedMessages);
        } else {
          // If Firestore has no messages, but we have local messages, migrate them!
          try {
            const migratedFlag = localStorage.getItem(`migrated_msgs_${scenarioId}_${user.uid}`);
            if (!migratedFlag) {
              let saved = await get(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId));
              if (!saved) {
                const localSaved = localStorage.getItem(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId));
                if (localSaved) saved = JSON.parse(localSaved);
              }
              if (saved && Array.isArray(saved) && saved.length > 0) {
                console.log("Migrating local messages to Firestore...");
                await saveMessagesBatch(scenarioId, saved);
              } else {
                // If there's nothing to migrate, just set messages to empty
                setMessages([]);
              }
              localStorage.setItem(`migrated_msgs_${scenarioId}_${user.uid}`, 'true');
            } else {
              // If we already migrated and Firestore is empty, it means the chat was reset
              setMessages([]);
            }
          } catch (e) {
            console.error("Failed to migrate messages", e);
            setMessages([]);
          }
        }
        setIsLoaded(true);
      });

      const unsubSummary = syncSummary(scenarioId, async (syncedSummary) => {
        if (syncedSummary !== undefined && syncedSummary !== null) {
          setStorySummary(syncedSummary);
        } else {
          // Migrate summary
          try {
            const migratedFlag = localStorage.getItem(`migrated_summary_${scenarioId}_${user.uid}`);
            if (!migratedFlag) {
              const savedSummary = await get(STORAGE_KEYS.SCENARIO_SUMMARY(scenarioId));
              if (savedSummary) {
                console.log("Migrating local summary to Firestore...");
                await saveSummary(scenarioId, savedSummary);
              } else {
                setStorySummary('');
              }
              localStorage.setItem(`migrated_summary_${scenarioId}_${user.uid}`, 'true');
            } else {
              setStorySummary('');
            }
          } catch (e) {
            setStorySummary('');
          }
        }
      });

      return () => {
        unsubMessages();
        unsubSummary();
      };
    }
  }, [isAuthReady, user, scenarioId, syncMessages, syncSummary, saveMessage, saveMessagesBatch, saveSummary]);

  // Refs to track pending storage updates and handle debouncing during message streaming
  const pendingSaveRef = useRef<{
    messages: Message[];
    storySummary: string;
    scenarioId: string;
  } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Flush pending changes to IndexedDB/localStorage immediately to prevent data loss
  const flushPendingSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingSaveRef.current) {
      const { messages: msgsToSave, storySummary: summaryToSave, scenarioId: idToSave } = pendingSaveRef.current;
      pendingSaveRef.current = null;

      // Local save to IndexedDB
      set(STORAGE_KEYS.SCENARIO_MESSAGES(idToSave), msgsToSave).catch(e => {
        console.error("Failed to save messages to IndexedDB", e);
      });
      
      // Local save to localStorage (fallback for last 50 messages)
      try {
        const recentMessages = msgsToSave.slice(-50);
        localStorage.setItem(STORAGE_KEYS.SCENARIO_MESSAGES(idToSave), JSON.stringify(recentMessages));
      } catch (e) {}

      // Save summary to IndexedDB
      set(STORAGE_KEYS.SCENARIO_SUMMARY(idToSave), summaryToSave).catch(e => {
        console.error("Failed to save summary to IndexedDB", e);
      });
    }
  }, []);

  // Save to local (debounced to avoid blocking main thread on stream updates)
  useEffect(() => {
    if (isLoaded) {
      pendingSaveRef.current = { messages, storySummary, scenarioId };
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        flushPendingSave();
      }, 1000);
    }
  }, [messages, storySummary, scenarioId, isLoaded, flushPendingSave]);

  // Flush immediately on unmount or when scenarioId changes (context change)
  useEffect(() => {
    return () => {
      flushPendingSave();
    };
  }, [scenarioId, flushPendingSave]);

  // Flush any pending saves immediately on unmount or scenario change to ensure absolutely no data loss
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        const { scenarioId: sId, messages: msgs, storySummary: summary } = pendingSaveRef.current;

        set(STORAGE_KEYS.SCENARIO_MESSAGES(sId), msgs).catch(e => {
          console.error("Failed to flush messages to IndexedDB on cleanup", e);
        });

        try {
          const recentMessages = msgs.slice(-50);
          localStorage.setItem(STORAGE_KEYS.SCENARIO_MESSAGES(sId), JSON.stringify(recentMessages));
        } catch (e) {}

        set(STORAGE_KEYS.SCENARIO_SUMMARY(sId), summary).catch(e => {
          console.error("Failed to flush summary to IndexedDB on cleanup", e);
        });
      }
    };
  }, [scenarioId]);

  // Helper to add a message (handles cloud save)
  const addMessage = async (message: Message) => {
    setMessages(prev => [...prev, message]);
    if (user) {
      setIsSaving(true);
      try {
        await saveMessage(scenarioId, message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Helper to update a message (handles cloud save)
  const updateMessage = async (message: Message) => {
    setMessages(prev => prev.map(m => m.id === message.id ? message : m));
    if (user) {
      setIsSaving(true);
      try {
        await saveMessage(scenarioId, message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Helper to update multiple messages (handles cloud save)
  const updateMessages = async (updatedMessages: Message[]) => {
    setMessages(prev => prev.map(m => {
      const updated = updatedMessages.find(um => um.id === m.id);
      return updated || m;
    }));
    if (user) {
      setIsSaving(true);
      try {
        await saveMessagesBatch(scenarioId, updatedMessages);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Helper to delete a message (handles cloud save)
  const deleteMessage = async (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    if (user) {
      setIsSaving(true);
      try {
        await cloudDeleteMessage(scenarioId, messageId);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Helper to rewind to a specific message (deletes subsequent messages)
  const rewindToMessage = async (messageId: string) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index === -1) return;

    const messagesToDelete = messages.slice(index + 1);
    const newMessages = messages.slice(0, index + 1);
    
    setMessages(newMessages);
    
    if (user) {
      setIsSaving(true);
      try {
        await deleteMessagesBatch(scenarioId, messagesToDelete.map(m => m.id));
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Helper to reset all messages
  const resetMessages = async () => {
    const messagesToDelete = [...messages];
    setMessages([]);
    if (user) {
      setIsSaving(true);
      try {
        await deleteMessagesBatch(scenarioId, messagesToDelete.map(m => m.id));
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Helper to update summary (handles cloud save)
  const updateSummary = async (text: string) => {
    setStorySummary(text);
    if (user) {
      setIsSaving(true);
      try {
        await saveSummary(scenarioId, text);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return {
    messages,
    setMessages,
    addMessage,
    updateMessage,
    updateMessages,
    deleteMessage,
    rewindToMessage,
    resetMessages,
    storySummary,
    setStorySummary,
    updateSummary,
    isLoaded,
    isSaving
  };
}
