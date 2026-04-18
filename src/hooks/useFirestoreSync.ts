import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  query, 
  getDocFromServer,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../firebase';
import { Scenario, Message, CodexEntry, InventoryItem } from '../lib/types';
import { compressImage } from '../lib/utils';

export function useFirestoreSync() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Test connection
  useEffect(() => {
    if (isAuthReady && user) {
      const testConnection = async () => {
        try {
          await getDocFromServer(doc(db, 'users', user.uid));
        } catch (error) {
          if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration.");
          }
        }
      };
      testConnection();
    }
  }, [isAuthReady, user]);

  const syncScenarios = useCallback((callback: (scenarios: Scenario[]) => void) => {
    if (!user) return () => {};

    const q = query(
      collection(db, 'users', user.uid, 'scenarios')
    );

    return onSnapshot(q, (snapshot) => {
      const scenarios = snapshot.docs.map(doc => doc.data() as Scenario);
      // Sort client-side to include scenarios without lastUpdated
      scenarios.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
      callback(scenarios);
    }, (error) => {
      console.error("Firestore Error (Sync Scenarios):", error);
    });
  }, [user]);

  const saveScenario = useCallback(async (scenario: Scenario): Promise<Scenario> => {
    if (!user) return scenario;
    try {
      const finalScenario = { ...scenario };
      if (finalScenario.avatarBase64 && finalScenario.avatarBase64.length > 500000) {
        finalScenario.avatarBase64 = await compressImage(finalScenario.avatarBase64, 512, 0.7);
      }

      if (finalScenario.profile) {
        // Remove inventory from profile to prevent document size bloat
        // Inventory is stored in a separate subcollection
        const profileWithoutInventory = { ...finalScenario.profile };
        delete profileWithoutInventory.inventory;
        finalScenario.profile = profileWithoutInventory;
      }

      await setDoc(doc(db, 'users', user.uid, 'scenarios', finalScenario.id), finalScenario);
      return finalScenario;
    } catch (error) {
      console.error("Firestore Error (Save Scenario):", error);
      throw error;
    }
  }, [user]);

  const deleteScenario = useCallback(async (scenarioId: string) => {
    if (!user) return;
    try {
      // We use multiple batches if needed to stay under the 500 limit
      let batch = writeBatch(db);
      let count = 0;

      const commitBatch = async () => {
        if (count > 0) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      };

      batch.delete(doc(db, 'users', user.uid, 'scenarios', scenarioId));
      count++;
      
      for (const name of ['messages', 'codex', 'inventory']) {
        const snap = await getDocs(collection(db, 'users', user.uid, 'scenarios', scenarioId, name));
        for (const d of snap.docs) {
          batch.delete(d.ref);
          count++;
          if (count >= 500) await commitBatch();
        }
      }
      
      batch.delete(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'summary', 'current'));
      count++;
      if (count >= 500) await commitBatch();
      
      await commitBatch();
    } catch (error) {
      console.error("Firestore Error (Delete Scenario):", error);
      throw error;
    }
  }, [user]);

  const syncMessages = useCallback((scenarioId: string, callback: (messages: Message[]) => void) => {
    if (!user) return () => {};

    const q = query(
      collection(db, 'users', user.uid, 'scenarios', scenarioId, 'messages')
    );

    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => doc.data() as Message);
      // Sort client-side to include messages without timestamp
      messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      callback(messages);
    }, (error) => {
      console.error("Firestore Error (Sync Messages):", error);
    });
  }, [user]);

  const saveMessage = useCallback(async (scenarioId: string, message: Message) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'messages', message.id), {
        ...message,
        timestamp: message.timestamp || Date.now()
      });
    } catch (error) {
      console.error("Firestore Error (Save Message):", error);
      throw error;
    }
  }, [user]);

  const saveMessagesBatch = useCallback(async (scenarioId: string, messages: Message[]) => {
    if (!user || messages.length === 0) return;
    try {
      let batch = writeBatch(db);
      let count = 0;

      for (const message of messages) {
        const ref = doc(db, 'users', user.uid, 'scenarios', scenarioId, 'messages', message.id);
        batch.set(ref, {
          ...message,
          timestamp: message.timestamp || Date.now()
        });
        count++;
        if (count >= 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    } catch (error) {
      console.error("Firestore Error (Save Messages Batch):", error);
      throw error;
    }
  }, [user]);

  const deleteMessagesBatch = useCallback(async (scenarioId: string, messageIds: string[]) => {
    if (!user || messageIds.length === 0) return;
    try {
      let batch = writeBatch(db);
      let count = 0;

      for (const id of messageIds) {
        batch.delete(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'messages', id));
        count++;
        if (count >= 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    } catch (error) {
      console.error("Firestore Error (Delete Messages Batch):", error);
      throw error;
    }
  }, [user]);

  const deleteMessage = useCallback(async (scenarioId: string, messageId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'messages', messageId));
    } catch (error) {
      console.error("Firestore Error (Delete Message):", error);
      throw error;
    }
  }, [user]);

  const syncCodex = useCallback((scenarioId: string, callback: (entries: CodexEntry[]) => void) => {
    if (!user) return () => {};

    const q = collection(db, 'users', user.uid, 'scenarios', scenarioId, 'codex');

    return onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => doc.data() as CodexEntry);
      callback(entries);
    }, (error) => {
      console.error("Firestore Error (Sync Codex):", error);
    });
  }, [user]);

  const saveCodexEntry = useCallback(async (scenarioId: string, entry: CodexEntry) => {
    if (!user) return;
    try {
      const finalEntry = { ...entry };
      if (finalEntry.imageUrl && finalEntry.imageUrl.length > 500000) {
        finalEntry.imageUrl = await compressImage(finalEntry.imageUrl, 512, 0.7);
      }
      await setDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'codex', finalEntry.id), finalEntry);
    } catch (error) {
      console.error("Firestore Error (Save Codex):", error);
      throw error;
    }
  }, [user]);

  const saveCodexEntriesBatch = useCallback(async (scenarioId: string, entries: CodexEntry[]) => {
    if (!user || entries.length === 0) return;
    try {
      let batch = writeBatch(db);
      let count = 0;

      for (const entry of entries) {
        const finalEntry = { ...entry };
        if (finalEntry.imageUrl && finalEntry.imageUrl.length > 500000) {
          finalEntry.imageUrl = await compressImage(finalEntry.imageUrl, 512, 0.7);
        }
        const ref = doc(db, 'users', user.uid, 'scenarios', scenarioId, 'codex', finalEntry.id);
        batch.set(ref, finalEntry);
        count++;
        if (count >= 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    } catch (error) {
      console.error("Firestore Error (Save Codex Batch):", error);
      throw error;
    }
  }, [user]);

  const syncInventory = useCallback((scenarioId: string, callback: (items: InventoryItem[]) => void) => {
    if (!user) return () => {};

    const q = collection(db, 'users', user.uid, 'scenarios', scenarioId, 'inventory');

    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data() as InventoryItem);
      callback(items);
    }, (error) => {
      console.error("Firestore Error (Sync Inventory):", error);
    });
  }, [user]);

  const saveInventoryItem = useCallback(async (scenarioId: string, item: InventoryItem) => {
    if (!user) return;
    try {
      const finalItem = { ...item };
      if (finalItem.imageUrl && finalItem.imageUrl.length > 500000) {
        finalItem.imageUrl = await compressImage(finalItem.imageUrl, 512, 0.7);
      }
      await setDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'inventory', finalItem.id), finalItem);
    } catch (error) {
      console.error("Firestore Error (Save Inventory):", error);
      throw error;
    }
  }, [user]);

  const saveInventoryItemsBatch = useCallback(async (scenarioId: string, items: InventoryItem[]) => {
    if (!user || items.length === 0) return;
    try {
      let batch = writeBatch(db);
      let count = 0;

      for (const item of items) {
        const finalItem = { ...item };
        if (finalItem.imageUrl && finalItem.imageUrl.length > 500000) {
          finalItem.imageUrl = await compressImage(finalItem.imageUrl, 512, 0.7);
        }
        const ref = doc(db, 'users', user.uid, 'scenarios', scenarioId, 'inventory', finalItem.id);
        batch.set(ref, finalItem);
        count++;
        if (count >= 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    } catch (error) {
      console.error("Firestore Error (Save Inventory Batch):", error);
      throw error;
    }
  }, [user]);

  const deleteInventoryItem = useCallback(async (scenarioId: string, itemId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'inventory', itemId));
    } catch (error) {
      console.error("Firestore Error (Delete Inventory):", error);
      throw error;
    }
  }, [user]);

  const syncSummary = useCallback((scenarioId: string, callback: (summary: string) => void) => {
    if (!user) return () => {};

    return onSnapshot(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'summary', 'current'), (doc) => {
      if (doc.exists()) {
        callback(doc.data().text);
      }
    }, (error) => {
      console.error("Firestore Error (Sync Summary):", error);
    });
  }, [user]);

  const saveSummary = useCallback(async (scenarioId: string, text: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'summary', 'current'), {
        text,
        lastUpdated: Date.now()
      });
    } catch (error) {
      console.error("Firestore Error (Save Summary):", error);
      throw error;
    }
  }, [user]);

  return {
    user,
    isAuthReady,
    syncScenarios,
    saveScenario,
    deleteScenario,
    syncMessages,
    saveMessage,
    saveMessagesBatch,
    deleteMessage,
    deleteMessagesBatch,
    syncCodex,
    saveCodexEntry,
    saveCodexEntriesBatch,
    syncInventory,
    saveInventoryItem,
    saveInventoryItemsBatch,
    deleteInventoryItem,
    syncSummary,
    saveSummary
  };
}
