import { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';
import { Message } from '../lib/types';
import { STORAGE_KEYS } from '../constants';
import { useFirestoreSync } from './useFirestoreSync';

export function useChatState(scenarioId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [storySummary, setStorySummary] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const { user, isAuthReady, syncMessages, saveMessage, deleteMessage: cloudDeleteMessage, syncSummary, saveSummary } = useFirestoreSync();

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
                for (const msg of saved) {
                  await saveMessage(scenarioId, msg);
                }
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
  }, [isAuthReady, user, scenarioId, syncMessages, syncSummary, saveMessage, saveSummary]);

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
    setMessages(prev => [...prev, message]);
    if (user) {
      await saveMessage(scenarioId, message);
    }
  };

  // Helper to update a message (handles cloud save)
  const updateMessage = async (message: Message) => {
    setMessages(prev => prev.map(m => m.id === message.id ? message : m));
    if (user) {
      await saveMessage(scenarioId, message);
    }
  };

  // Helper to update multiple messages (handles cloud save)
  const updateMessages = async (updatedMessages: Message[]) => {
    setMessages(prev => prev.map(m => {
      const updated = updatedMessages.find(um => um.id === m.id);
      return updated || m;
    }));
    if (user) {
      for (const msg of updatedMessages) {
        await saveMessage(scenarioId, msg);
      }
    }
  };

  // Helper to delete a message (handles cloud save)
  const deleteMessage = async (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    if (user) {
      await cloudDeleteMessage(scenarioId, messageId);
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
      for (const msg of messagesToDelete) {
        await cloudDeleteMessage(scenarioId, msg.id);
      }
    }
  };

  // Helper to reset all messages
  const resetMessages = async () => {
    const messagesToDelete = [...messages];
    setMessages([]);
    if (user) {
      for (const msg of messagesToDelete) {
        await cloudDeleteMessage(scenarioId, msg.id);
      }
    }
  };

  // Helper to update summary (handles cloud save)
  const updateSummary = async (text: string) => {
    setStorySummary(text);
    if (user) {
      await saveSummary(scenarioId, text);
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
    isLoaded
  };
}
