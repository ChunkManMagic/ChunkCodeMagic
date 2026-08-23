import { useState, useEffect, useRef } from 'react';
import { get, set } from 'idb-keyval';
import { Message } from '../lib/types';
import { STORAGE_KEYS } from '../constants';
import { useFirestoreSync } from './useFirestoreSync';

// Migration flags live in IndexedDB (not localStorage) so they survive
// storage pruning/quota resets and behave consistently across tabs; keys avoid
// the personaforge_ prefix on purpose — the stale-data cleanup prunes any
// personaforge_* key whose third segment isn't a live scenario id.
const MIGRATED_MSGS_KEY = (scenarioId: string, uid: string) => `pf_migrated_msgs_${scenarioId}_${uid}`;
const MIGRATED_SUMMARY_KEY = (scenarioId: string, uid: string) => `pf_migrated_summary_${scenarioId}_${uid}`;

// A duplicate-send within this window (double-tap on Send/Enter) is treated as
// an accidental re-trigger, not a deliberate repeated message.
const DUPLICATE_SEND_WINDOW_MS = 800;

export function useChatState(scenarioId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [storySummary, setStorySummary] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { user, isAuthReady, syncMessages, saveMessage, saveMessagesBatch, deleteMessage: cloudDeleteMessage, deleteMessagesBatch, syncSummary, saveSummary } = useFirestoreSync();

  // Ids of messages added optimistically on this device, with the time they
  // were added. Used to (a) protect them from being wiped by a Firestore
  // snapshot that raced ahead of their upload, and (b) collapse accidental
  // duplicate sends.
  const pendingIdsRef = useRef<Map<string, number>>(new Map());
  const lastUserSendRef = useRef<{ text: string; at: number } | null>(null);

  const prunePendingIds = () => {
    const cutoff = Date.now() - 30000;
    for (const [id, ts] of pendingIdsRef.current) {
      if (ts < cutoff) pendingIdsRef.current.delete(id);
    }
  };

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
          // Merge instead of overwriting: a snapshot can arrive while our own
          // optimistic add/upload is still in flight, and blindly replacing
          // state here silently dropped those messages. Remote wins for ids
          // it knows about (server is source of truth, so remote deletes and
          // edits propagate); locally-added messages that haven't shown up in
          // a snapshot yet are preserved.
          setMessages(prev => {
            const remoteIds = new Set(syncedMessages.map(m => m.id));
            const inFlightLocal = prev.filter(
              m => !remoteIds.has(m.id) && pendingIdsRef.current.has(m.id)
            );
            const merged = [...inFlightLocal, ...syncedMessages];
            merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            return merged;
          });
        } else {
          // If Firestore has no messages, but we have local messages, migrate them!
          try {
            const migratedFlag = await get(MIGRATED_MSGS_KEY(scenarioId, user.uid));
            if (!migratedFlag) {
              let saved = await get(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId));
              if (!saved) {
                const localSaved = localStorage.getItem(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId));
                if (localSaved) saved = JSON.parse(localSaved);
              }
              if (saved && Array.isArray(saved) && saved.length > 0) {
                console.log("Migrating local messages to Firestore...");
                await saveMessagesBatch(scenarioId, saved);
                // Only mark migrated after the upload succeeded — marking
                // first would permanently skip a failed migration (data loss).
                await set(MIGRATED_MSGS_KEY(scenarioId, user.uid), true);
              } else {
                // Nothing to migrate; remember that so we don't re-scan forever.
                await set(MIGRATED_MSGS_KEY(scenarioId, user.uid), true);
                setMessages([]);
              }
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
            const migratedFlag = await get(MIGRATED_SUMMARY_KEY(scenarioId, user.uid));
            if (!migratedFlag) {
              const savedSummary = await get(STORAGE_KEYS.SCENARIO_SUMMARY(scenarioId));
              if (savedSummary) {
                console.log("Migrating local summary to Firestore...");
                await saveSummary(scenarioId, savedSummary);
              } else {
                setStorySummary('');
              }
              await set(MIGRATED_SUMMARY_KEY(scenarioId, user.uid), true);
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

  // Save to local and cloud
  useEffect(() => {
    if (isLoaded) {
      // Local save
      set(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId), messages).catch(e => {
        console.error("Failed to save messages to IndexedDB", e);
      });
      
      try {
        const recentMessages = messages.slice(-50);
        localStorage.setItem(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId), JSON.stringify(recentMessages));
      } catch (e) {}

      set(STORAGE_KEYS.SCENARIO_SUMMARY(scenarioId), storySummary).catch(e => {
        console.error("Failed to save summary to IndexedDB", e);
      });
    }
  }, [messages, storySummary, scenarioId, isLoaded]);

  // Helper to add a message (handles cloud save)
  const addMessage = async (message: Message) => {
    const now = Date.now();
    const stamped: Message = { ...message, timestamp: message.timestamp || now };

    // Collapse rapid duplicate triggers (double-click on Send, Enter twice)
    // before they ever reach state: same id is always a dupe, and an identical
    // user text sent within a short window is treated as an accidental
    // re-trigger. Refs give synchronous checks across back-to-back calls.
    prunePendingIds();
    if (pendingIdsRef.current.has(stamped.id)) return;
    const lastSend = lastUserSendRef.current;
    if (
      stamped.role === 'user' &&
      lastSend &&
      lastSend.text === stamped.text &&
      now - lastSend.at < DUPLICATE_SEND_WINDOW_MS
    ) {
      return;
    }
    pendingIdsRef.current.set(stamped.id, now);
    if (stamped.role === 'user') {
      lastUserSendRef.current = { text: stamped.text, at: now };
    }

    setMessages(prev => (prev.some(m => m.id === stamped.id) ? prev : [...prev, stamped]));
    if (user) {
      setIsSaving(true);
      try {
        await saveMessage(scenarioId, stamped);
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
    pendingIdsRef.current.delete(messageId);
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
    
    for (const m of messagesToDelete) pendingIdsRef.current.delete(m.id);
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
    pendingIdsRef.current.clear();
    lastUserSendRef.current = null;
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
