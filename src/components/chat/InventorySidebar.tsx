import { memo } from 'react';
import { motion } from 'motion/react';
import { Package, Repeat, Sparkles, Loader2, X as CloseIcon, RefreshCw, ImageIcon, Trash2, Plus } from 'lucide-react';
import { Message, InventoryItem } from '../../lib/types';

interface InventorySidebarProps {
  inventory: InventoryItem[];
  messages: Message[];
  setShowInventory: (show: boolean) => void;
  isAutoInventoryEnabled: boolean;
  setIsAutoInventoryEnabled: (enabled: boolean) => void;
  isScanningInventory: boolean;
  handleAutoUpdateInventory: (force?: boolean, messagesOverride?: Message[]) => void;
  isGeneratingItemImage: string | null;
  handleGenerateItemImage: (item: any) => void;
  addOrUpdateItem: (item: InventoryItem) => void;
  removeItem: (itemId: string) => void;
}

export const InventorySidebar = memo(function InventorySidebar({
  inventory,
  messages,
  setShowInventory,
  isAutoInventoryEnabled,
  setIsAutoInventoryEnabled,
  isScanningInventory,
  handleAutoUpdateInventory,
  isGeneratingItemImage,
  handleGenerateItemImage,
  addOrUpdateItem,
  removeItem
}: InventorySidebarProps) {
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 } as any}
      className="absolute right-0 top-0 bottom-0 w-80 glass-panel border-l border-white/10 z-40 flex flex-col shadow-2xl"
    >
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-lg font-serif font-bold text-white flex items-center gap-2">
          <Package className="w-5 h-5 text-purple-400" />
          Inventory
        </h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsAutoInventoryEnabled(!isAutoInventoryEnabled)}
            className={`p-2 rounded-lg transition-all ${isAutoInventoryEnabled ? 'text-purple-400 bg-purple-500/10' : 'text-zinc-500 hover:text-purple-400'}`}
            title={isAutoInventoryEnabled ? "Auto-scan enabled" : "Auto-scan disabled"}
          >
            <Repeat className={`w-4 h-4 ${isAutoInventoryEnabled ? 'animate-spin-slow' : ''}`} />
          </button>
          <button 
            onClick={() => handleAutoUpdateInventory(true, messages)} 
            disabled={isScanningInventory || messages.length < 2}
            className={`p-2 rounded-lg transition-all ${isScanningInventory ? 'text-purple-400 animate-pulse' : 'text-zinc-500 hover:text-purple-400 hover:bg-white/5'}`}
            title="Scan story for inventory updates"
          >
            {isScanningInventory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          </button>
          <button onClick={() => setShowInventory(false)} className="text-zinc-500 hover:text-white">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {inventory.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Inventory is empty</p>
          </div>
        ) : (
          inventory.map((item) => (
            <div key={item.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group overflow-hidden">
              {item.imageUrl && (
                <div className="aspect-square w-full mb-3 rounded-xl overflow-hidden border border-white/10 relative group/img">
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover transition-transform group-hover/img:scale-110" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      onClick={() => handleGenerateItemImage(item)}
                      className="p-2 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-all"
                    >
                      <RefreshCw className={`w-4 h-4 ${isGeneratingItemImage === item.id ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>
              )}
              
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-bold text-white truncate group-hover:text-purple-400 transition-colors">{item.name}</h4>
                    {item.rarity && (
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest ${
                        item.rarity === 'Legendary' ? 'bg-orange-500/20 text-orange-400' :
                        item.rarity === 'Epic' ? 'bg-purple-500/20 text-purple-400' :
                        item.rarity === 'Rare' ? 'bg-blue-500/20 text-blue-400' :
                        item.rarity === 'Uncommon' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-zinc-500/20 text-zinc-400'
                      }`}>
                        {item.rarity}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">{item.type}</span>
                    {item.value && <span className="text-[8px] font-bold text-emerald-400/60 uppercase tracking-widest">• {item.value}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!item.imageUrl && (
                    <button 
                      onClick={() => handleGenerateItemImage(item)}
                      disabled={isGeneratingItemImage === item.id}
                      className="p-1 rounded-md hover:bg-white/5 text-zinc-600 hover:text-purple-400 transition-all"
                      title="Generate Item Image"
                    >
                      {isGeneratingItemImage === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      if (item.quantity > 1) {
                        addOrUpdateItem({ ...item, quantity: item.quantity - 1 });
                      } else {
                        removeItem(item.id);
                      }
                    }}
                    className="p-1 rounded-md hover:bg-red-500/20 text-zinc-600 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold text-zinc-400">
                    x{item.quantity}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">{item.description}</p>
            </div>
          ))
        )}
      </div>

      <div className="p-6 border-t border-white/5 bg-black/20">
        <button
          onClick={() => {
            const newItemName = prompt("Item Name?");
            if (!newItemName) return;
            const newItem: InventoryItem = {
              id: Math.random().toString(36).substr(2, 9),
              name: newItemName,
              description: "New item added to inventory.",
              quantity: 1,
              type: "Misc"
            };
            addOrUpdateItem(newItem);
          }}
          className="w-full py-3 rounded-xl bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 text-[10px] font-bold uppercase tracking-widest border border-purple-500/20 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>
    </motion.div>
  );
});
