import { useState, useCallback, useEffect, useRef } from 'react';
import { CharacterProfile, InventoryItem } from '../lib/types';
import { extractInventoryUpdates, generateItemImage } from '../lib/gemini';
import { generateId } from '../lib/gemini';
import { useToast } from './useToast';
import { useFirestoreSync } from './useFirestoreSync';
import { useStorage } from './useStorage';
import { STORAGE_KEYS } from '../constants';

export function useInventory(scenarioId: string, profile: CharacterProfile, messages: any[]) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isScanningInventory, setIsScanningInventory] = useState(false);
  const [isAutoInventoryEnabled, setIsAutoInventoryEnabled] = useState(false);
  const [isGeneratingItemImage, setIsGeneratingItemImage] = useState<string | null>(null);
  const { toastSuccess, toastError } = useToast();
  
  const { user, isAuthReady, syncInventory, saveInventoryItem, deleteInventoryItem } = useFirestoreSync();
  const { loadData, saveData } = useStorage();
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Use a ref to access profile.inventory without triggering re-renders
  const profileInventoryRef = useRef(profile.inventory);
  useEffect(() => {
    profileInventoryRef.current = profile.inventory;
  }, [profile.inventory]);

  useEffect(() => {
    const loadInventoryData = async () => {
      try {
        const savedInventory = await loadData<InventoryItem[]>(STORAGE_KEYS.SCENARIO_INVENTORY(scenarioId));
        if (savedInventory) {
          setInventory(savedInventory);
        } else if (profileInventoryRef.current && profileInventoryRef.current.length > 0) {
          // Migrate from profile
          setInventory(profileInventoryRef.current);
        }
      } catch (e) {
        console.error("Failed to load inventory data", e);
      } finally {
        if (!user) setIsLoaded(true);
      }
    };
    loadInventoryData();
  }, [scenarioId, loadData, user]);

  useEffect(() => {
    if (isAuthReady && user && scenarioId) {
      const unsub = syncInventory(scenarioId, async (syncedItems) => {
        if (syncedItems.length > 0) {
          setInventory(syncedItems);
        } else {
          // Migrate local to cloud
          try {
            const migratedFlag = localStorage.getItem(`migrated_inv_${scenarioId}_${user.uid}`);
            if (!migratedFlag) {
              const savedInventory = await loadData<InventoryItem[]>(STORAGE_KEYS.SCENARIO_INVENTORY(scenarioId));
              const itemsToMigrate = savedInventory || profileInventoryRef.current || [];
              if (itemsToMigrate.length > 0) {
                console.log("Migrating local inventory to Firestore...");
                for (const item of itemsToMigrate) {
                  await saveInventoryItem(scenarioId, item);
                }
              }
              localStorage.setItem(`migrated_inv_${scenarioId}_${user.uid}`, 'true');
            }
          } catch (e) {}
        }
        setIsLoaded(true);
      });
      return () => unsub();
    }
  }, [isAuthReady, user, scenarioId, syncInventory, loadData, saveInventoryItem]);

  useEffect(() => {
    if (isLoaded) {
      saveData(STORAGE_KEYS.SCENARIO_INVENTORY(scenarioId), inventory);
    }
  }, [inventory, scenarioId, isLoaded, saveData]);

  const addOrUpdateItem = useCallback(async (item: InventoryItem) => {
    setInventory(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) return prev.map(i => i.id === item.id ? item : i);
      return [...prev, item];
    });
    if (user) {
      await saveInventoryItem(scenarioId, item);
    }
  }, [user, scenarioId, saveInventoryItem]);

  const removeItem = useCallback(async (itemId: string) => {
    setInventory(prev => prev.filter(i => i.id !== itemId));
    if (user) {
      await deleteInventoryItem(scenarioId, itemId);
    }
  }, [user, scenarioId, deleteInventoryItem]);

  const handleGenerateItemImage = useCallback(async (item: InventoryItem) => {
    setIsGeneratingItemImage(item.id);
    try {
      const imageUrl = await generateItemImage(item, profile);
      if (imageUrl) {
        const updatedItem = { ...item, imageUrl };
        await addOrUpdateItem(updatedItem);
        toastSuccess(`Generated image for ${item.name}`);
      }
    } catch (error: any) {
      console.error("Failed to generate item image:", error);
      toastError(`Item image generation failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingItemImage(null);
    }
  }, [profile, addOrUpdateItem, toastSuccess, toastError]);

  const handleAutoUpdateInventory = useCallback(async (force = false, messagesOverride?: any[]) => {
    if (!force && !isAutoInventoryEnabled) return;
    const currentMessages = messagesOverride || messages;
    if (currentMessages.length < 2) return;

    setIsScanningInventory(true);
    try {
      const updates = await extractInventoryUpdates(currentMessages, inventory);
      
      let changed = false;

      // Handle removals
      if (updates.removed.length > 0) {
        updates.removed.forEach(idOrName => {
          const item = inventory.find(i => i.id === idOrName || i.name === idOrName);
          if (item) {
            removeItem(item.id);
            changed = true;
          }
        });
      }

      // Handle updates
      if (updates.updated.length > 0) {
        for (const update of updates.updated) {
          const item = inventory.find(i => i.id === update.id || i.name === (update as any).name);
          if (item) {
            await addOrUpdateItem({ ...item, quantity: update.quantity });
            changed = true;
          }
        }
      }

      // Handle additions
      if (updates.added.length > 0) {
        for (const newItem of updates.added) {
          const item: InventoryItem = {
            id: generateId(),
            name: newItem.name || 'Unknown Item',
            description: newItem.description || '',
            type: newItem.type || 'Misc',
            quantity: newItem.quantity || 1,
            rarity: newItem.rarity,
            value: newItem.value
          };
          await addOrUpdateItem(item);
          changed = true;
        }
      }

      if (changed && force) {
        toastSuccess("Inventory updated");
      } else if (force) {
        toastSuccess("No inventory changes detected");
      }
    } catch (error: any) {
      console.error("Failed to auto-update inventory:", error);
      if (force) {
        toastError(`Failed to update inventory: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsScanningInventory(false);
    }
  }, [inventory, isAutoInventoryEnabled, messages, addOrUpdateItem, removeItem, toastSuccess, toastError]);

  return {
    inventory,
    isScanningInventory,
    isAutoInventoryEnabled,
    setIsAutoInventoryEnabled,
    isGeneratingItemImage,
    handleGenerateItemImage,
    handleAutoUpdateInventory,
    addOrUpdateItem,
    removeItem
  };
}
