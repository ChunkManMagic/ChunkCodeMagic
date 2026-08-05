import { useState, useEffect, useRef } from 'react';
import { CodexEntry, InventoryItem } from '../lib/types';

export function useBadgeNotifications(
  codexEntries: CodexEntry[],
  inventory: InventoryItem[],
  isCodexOpen: boolean,
  isInventoryOpen: boolean
) {
  const [unreadCodexCount, setUnreadCodexCount] = useState(0);
  const [unreadInventoryCount, setUnreadInventoryCount] = useState(0);

  const prevCodexLength = useRef(codexEntries.length);
  const prevInventoryLength = useRef(inventory.length);

  // Codex notification logic
  useEffect(() => {
    if (isCodexOpen) {
      setUnreadCodexCount(0);
    } else if (codexEntries.length > prevCodexLength.current) {
      setUnreadCodexCount(prev => prev + (codexEntries.length - prevCodexLength.current));
    }
    prevCodexLength.current = codexEntries.length;
  }, [codexEntries.length, isCodexOpen]);

  // Inventory notification logic
  useEffect(() => {
    if (isInventoryOpen) {
      setUnreadInventoryCount(0);
    } else if (inventory.length > prevInventoryLength.current) {
      setUnreadInventoryCount(prev => prev + (inventory.length - prevInventoryLength.current));
    }
    prevInventoryLength.current = inventory.length;
  }, [inventory.length, isInventoryOpen]);

  return {
    unreadCodexCount,
    unreadInventoryCount,
    hasUnreadCodex: unreadCodexCount > 0,
    hasUnreadInventory: unreadInventoryCount > 0,
  };
}
