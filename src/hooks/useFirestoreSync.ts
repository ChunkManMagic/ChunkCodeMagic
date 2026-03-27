import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  query, 
  getDocFromServer
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../firebase';
import { Scenario, Message, CodexEntry, InventoryItem } from '../lib/types';

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

  const saveScenario = async (scenario: Scenario) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'scenarios', scenario.id), scenario);
    } catch (error) {
      console.error("Firestore Error (Save Scenario):", error);
      throw error;
    }
  };

  const deleteScenario = async (scenarioId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId));
      // Subcollections are not automatically deleted in Firestore client SDK, 
      // but for this app, we'll just leave them or handle them if needed.
    } catch (error) {
      console.error("Firestore Error (Delete Scenario):", error);
      throw error;
    }
  };

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

  const saveMessage = async (scenarioId: string, message: Message) => {
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
  };

  const deleteMessage = async (scenarioId: string, messageId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'messages', messageId));
    } catch (error) {
      console.error("Firestore Error (Delete Message):", error);
      throw error;
    }
  };

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

  const saveCodexEntry = async (scenarioId: string, entry: CodexEntry) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'codex', entry.id), entry);
    } catch (error) {
      console.error("Firestore Error (Save Codex):", error);
      throw error;
    }
  };

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

  const saveInventoryItem = async (scenarioId: string, item: InventoryItem) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'scenarios', scenarioId, 'inventory', item.id), item);
    } catch (error) {
      console.error("Firestore Error (Save Inventory):", error);
      throw error;
    }
  };

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

  const saveSummary = async (scenarioId: string, text: string) => {
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
  };

  return {
    user,
    isAuthReady,
    syncScenarios,
    saveScenario,
    deleteScenario,
    syncMessages,
    saveMessage,
    deleteMessage,
    syncCodex,
    saveCodexEntry,
    syncInventory,
    saveInventoryItem,
    syncSummary,
    saveSummary
  };
}
