import { useState, useCallback } from 'react';
import { CharacterProfile, InventoryItem } from '../lib/types';
import { extractInventoryUpdates, generateItemImage } from '../lib/gemini';
import { generateId } from '../lib/gemini';
import { useToast } from './useToast';

export function useInventory(profile: CharacterProfile, onUpdateProfile: (profile: CharacterProfile) => void) {
  const [isScanningInventory, setIsScanningInventory] = useState(false);
  const [isAutoInventoryEnabled, setIsAutoInventoryEnabled] = useState(false);
  const [isGeneratingItemImage, setIsGeneratingItemImage] = useState<string | null>(null);
  const { toastSuccess, toastError } = useToast();

  const handleGenerateItemImage = useCallback(async (item: InventoryItem) => {
    setIsGeneratingItemImage(item.id);
    try {
      const imageUrl = await generateItemImage(item, profile);
      if (imageUrl) {
        const updatedInventory = (profile.inventory || []).map(i => i.id === item.id ? { ...i, imageUrl } : i);
        onUpdateProfile({ ...profile, inventory: updatedInventory });
        toastSuccess(`Generated image for ${item.name}`);
      }
    } catch (error: any) {
      console.error("Failed to generate item image:", error);
      toastError(`Item image generation failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingItemImage(null);
    }
  }, [profile, onUpdateProfile, toastSuccess, toastError]);

  const handleAutoUpdateInventory = useCallback(async (messages: any[], force = false, messagesOverride?: any[]) => {
    if (!force && !isAutoInventoryEnabled) return;
    const currentMessages = messagesOverride || messages;
    if (currentMessages.length < 2) return;

    setIsScanningInventory(true);
    try {
      const updates = await extractInventoryUpdates(currentMessages, profile.inventory || []);
      
      let newInventory = [...(profile.inventory || [])];
      let changed = false;

      // Handle removals
      if (updates.removed.length > 0) {
        newInventory = newInventory.filter(item => 
          !updates.removed.includes(item.id) && !updates.removed.includes(item.name)
        );
        changed = true;
      }

      // Handle updates
      if (updates.updated.length > 0) {
        updates.updated.forEach(update => {
          const item = newInventory.find(i => i.id === update.id || i.name === (update as any).name);
          if (item) {
            item.quantity = update.quantity;
            changed = true;
          }
        });
      }

      // Handle additions
      if (updates.added.length > 0) {
        updates.added.forEach(newItem => {
          const item: InventoryItem = {
            id: generateId(),
            name: newItem.name || 'Unknown Item',
            description: newItem.description || '',
            type: newItem.type || 'Misc',
            quantity: newItem.quantity || 1,
            rarity: newItem.rarity,
            value: newItem.value
          };
          newInventory.push(item);
          changed = true;
        });
      }

      if (changed) {
        onUpdateProfile({ ...profile, inventory: newInventory });
        if (force) {
          toastSuccess("Inventory updated");
        }
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
  }, [profile, isAutoInventoryEnabled, onUpdateProfile, toastSuccess, toastError]);

  return {
    isScanningInventory,
    isAutoInventoryEnabled,
    setIsAutoInventoryEnabled,
    isGeneratingItemImage,
    handleGenerateItemImage,
    handleAutoUpdateInventory
  };
}
