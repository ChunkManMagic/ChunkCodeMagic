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

export interface FirestoreErrorInfo {
  errorPath: string;
  errorCode: string;
  errorMessage: string;
  attemptedOperation: 'read' | 'write' | 'delete';
}

export function handleFirestoreError(
  error: any,
  errorPath: string,
  attemptedOperation: 'read' | 'write' | 'delete'
): Error {
  const errorCode = error?.code || 'unknown';
  const errorMessage = error?.message || String(error);
  
  const diagnosticInfo: FirestoreErrorInfo = {
    errorPath,
    errorCode,
    errorMessage,
    attemptedOperation
  };
  
  console.error("Firestore Diagnostic Collection Error:", diagnosticInfo);
  return new Error("Couldn't save — check your connection and try again.");
}

export function useFirestoreSync() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeWrites, setActiveWrites] = useState(0);

  useEffect(() => {
    setIsSyncing(activeWrites > 0);
  }, [activeWrites]);

  const startWrite = () => setActiveWrites(prev => prev + 1);
  const endWrite = () => setActiveWrites(prev => Math.max(0, prev - 1));

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
      const scenarios = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Scenario));
      // Deduplicate by ID
      const uniqueScenarios = Array.from(new Map(scenarios.map(s => [s.id, s])).values());
      // Sort client-side to include scenarios without lastUpdated
      uniqueScenarios.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
      callback(uniqueScenarios);
    }, (error) => {
      handleFirestoreError(error, `users/${user.uid}/scenarios`, 'read');
    });
  }, [user]);

  const saveScenario = useCallback(async (scenario: Scenario): Promise<Scenario> => {
    if (!user) return scenario;
    startWrite();
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
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenario.id}`, 'write');
    } finally {
      endWrite();
    }
  }, [user]);

  const deleteScenario = useCallback(async (scenarioId: string) => {
    if (!user) return;
    startWrite();
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
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}`, 'delete');
    } finally {
      endWrite();
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
      handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/messages`, 'read');
    });
  }, [user]);

  const saveMessage = useCallback(async (scenarioId: string, message: Message) => {
    if (!user) return;
    startWrite();
    try {
      await setDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'messages', message.id), {
        ...message,
        timestamp: message.timestamp || Date.now()
      });
    } catch (error) {
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/messages/${message.id}`, 'write');
    } finally {
      endWrite();
    }
  }, [user]);

  const saveMessagesBatch = useCallback(async (scenarioId: string, messages: Message[]) => {
    if (!user || messages.length === 0) return;
    startWrite();
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
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/messages`, 'write');
    } finally {
      endWrite();
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
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/messages`, 'delete');
    }
  }, [user]);

  const deleteMessage = useCallback(async (scenarioId: string, messageId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'messages', messageId));
    } catch (error) {
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/messages/${messageId}`, 'delete');
    }
  }, [user]);

  const syncCodex = useCallback((scenarioId: string, callback: (entries: CodexEntry[]) => void) => {
    if (!user) return () => {};

    const q = collection(db, 'users', user.uid, 'scenarios', scenarioId, 'codex');

    return onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => doc.data() as CodexEntry);
      callback(entries);
    }, (error) => {
      handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/codex`, 'read');
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
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/codex/${entry.id}`, 'write');
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
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/codex`, 'write');
    }
  }, [user]);

  const syncInventory = useCallback((scenarioId: string, callback: (items: InventoryItem[]) => void) => {
    if (!user) return () => {};

    const q = collection(db, 'users', user.uid, 'scenarios', scenarioId, 'inventory');

    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data() as InventoryItem);
      callback(items);
    }, (error) => {
      handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/inventory`, 'read');
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
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/inventory/${item.id}`, 'write');
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
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/inventory`, 'write');
    }
  }, [user]);

  const deleteInventoryItem = useCallback(async (scenarioId: string, itemId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'inventory', itemId));
    } catch (error) {
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/inventory/${itemId}`, 'delete');
    }
  }, [user]);

  const syncSummary = useCallback((scenarioId: string, callback: (summary: string) => void) => {
    if (!user) return () => {};

    return onSnapshot(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'summary', 'current'), (doc) => {
      if (doc.exists()) {
        callback(doc.data().text);
      }
    }, (error) => {
      handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/summary/current`, 'read');
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
      throw handleFirestoreError(error, `users/${user.uid}/scenarios/${scenarioId}/summary/current`, 'write');
    }
  }, [user]);

  return {
    user,
    isAuthReady,
    isSyncing,
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
