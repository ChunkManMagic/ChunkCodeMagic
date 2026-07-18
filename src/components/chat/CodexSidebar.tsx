import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Book, RefreshCw, Repeat, Sparkles, Loader2, Wand2, X as CloseIcon, Plus, Trash2 } from 'lucide-react';
import { CodexEntry, Message } from '../../lib/types';

interface CodexSidebarProps {
  codexEntries: CodexEntry[];
  setCodexEntries: React.Dispatch<React.SetStateAction<CodexEntry[]>>;
  messages: Message[];
  setShowCodex: (show: boolean) => void;
  isAutoProfileEnabled: boolean;
  setIsAutoProfileEnabled: (enabled: boolean) => void;
  isAutoCodexEnabled: boolean;
  setIsAutoCodexEnabled: (enabled: boolean) => void;
  isAutoPopulatingCodex: boolean;
  handleAutoPopulateCodex: (force?: boolean, history?: { role: string; parts: { text: string }[] }[]) => void;
  isUpdatingProfile: boolean;
  handleAutoUpdateProfile: (messages: Message[], force?: boolean, history?: { role: string; parts: { text: string }[] }[]) => void;
  isRefiningCodexEntry: boolean;
  handleRefineCodexEntry: () => void;
  isGeneratingCodexImage: string | null;
  handleGenerateCodexImage: (entry: CodexEntry) => void;
  newCodexEntry: Partial<CodexEntry>;
  setNewCodexEntry: React.Dispatch<React.SetStateAction<Partial<CodexEntry>>>;
  setConfirmModal: (modal: any) => void;
}

export function CodexSidebar({
  codexEntries,
  setCodexEntries,
  messages,
  setShowCodex,
  isAutoProfileEnabled,
  setIsAutoProfileEnabled,
  isAutoCodexEnabled,
  setIsAutoCodexEnabled,
  isAutoPopulatingCodex,
  handleAutoPopulateCodex,
  isUpdatingProfile,
  handleAutoUpdateProfile,
  isRefiningCodexEntry,
  handleRefineCodexEntry,
  isGeneratingCodexImage,
  handleGenerateCodexImage,
  newCodexEntry,
  setNewCodexEntry,
  setConfirmModal
}: CodexSidebarProps) {
  const [isAddingCodex, setIsAddingCodex] = useState(false);

  const handleAddCodexEntry = () => {
    if (!newCodexEntry.title || !newCodexEntry.content) return;
    const entry: CodexEntry = {
      id: Math.random().toString(36).substr(2, 9),
      title: newCodexEntry.title,
      category: newCodexEntry.category as any || 'Lore',
      content: newCodexEntry.content
    };
    setCodexEntries(prev => [...prev, entry]);
    setNewCodexEntry({ category: 'Lore' });
    setIsAddingCodex(false);
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute right-0 top-0 bottom-0 w-80 glass-panel border-l border-white/10 z-40 flex flex-col shadow-2xl"
    >
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-lg font-serif font-bold text-white flex items-center gap-2">
          <Book className="w-5 h-5 text-emerald-400" />
          World Codex
        </h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsAutoProfileEnabled(!isAutoProfileEnabled)}
            className={`p-2 rounded-lg transition-all ${isAutoProfileEnabled ? 'text-purple-400 bg-purple-500/10' : 'text-zinc-500 hover:text-purple-400'}`}
            title={isAutoProfileEnabled ? "Auto-character update enabled" : "Auto-character update disabled"}
          >
            <RefreshCw className={`w-4 h-4 ${isAutoProfileEnabled ? 'animate-spin-slow' : ''}`} />
          </button>
          <button 
            onClick={() => setIsAutoCodexEnabled(!isAutoCodexEnabled)}
            className={`p-2 rounded-lg transition-all ${isAutoCodexEnabled ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-500 hover:text-blue-400'}`}
            title={isAutoCodexEnabled ? "Auto-scan enabled" : "Auto-scan disabled"}
          >
            <Repeat className={`w-4 h-4 ${isAutoCodexEnabled ? 'animate-spin-slow' : ''}`} />
          </button>
          <button 
            onClick={() => handleAutoPopulateCodex(true)} 
            disabled={isAutoPopulatingCodex || messages.length < 2}
            className={`p-2 rounded-lg transition-all ${isAutoPopulatingCodex ? 'text-emerald-400 animate-pulse' : 'text-zinc-500 hover:text-emerald-400 hover:bg-white/5'}`}
            title="Scan story for new entries"
          >
            {isAutoPopulatingCodex ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          </button>
          <button 
            onClick={() => handleAutoUpdateProfile(messages, true)}
            disabled={isUpdatingProfile || messages.length < 5}
            className={`p-2 rounded-lg transition-all ${isUpdatingProfile ? 'text-purple-400 animate-pulse' : 'text-zinc-500 hover:text-purple-400 hover:bg-white/5'}`}
            title="Update character profile from history"
          >
            {isUpdatingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setShowCodex(false)} className="text-zinc-500 hover:text-white">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {isAddingCodex ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 p-4 rounded-2xl bg-white/5 border border-white/10">
            <input
              type="text"
              placeholder="Entry Title"
              value={newCodexEntry.title || ''}
              onChange={e => setNewCodexEntry(prev => ({ ...prev, title: e.target.value }))}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <select
              value={newCodexEntry.category}
              onChange={e => setNewCodexEntry(prev => ({ ...prev, category: e.target.value as any }))}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="Lore">Lore</option>
              <option value="Mechanics">Mechanics</option>
              <option value="Location">Location</option>
              <option value="Item">Item</option>
            </select>
            <textarea
              placeholder="Description/Rules..."
              value={newCodexEntry.content || ''}
              onChange={e => setNewCodexEntry(prev => ({ ...prev, content: e.target.value }))}
              rows={4}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
            />
            <div className="flex gap-2">
              <button 
                onClick={handleRefineCodexEntry} 
                disabled={isRefiningCodexEntry || !newCodexEntry.title || !newCodexEntry.content}
                className="flex-1 py-2 rounded-xl bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-[10px] font-bold uppercase tracking-widest border border-blue-500/20 flex items-center justify-center gap-2"
              >
                {isRefiningCodexEntry ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                Refine
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsAddingCodex(false)} className="flex-1 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-widest">Cancel</button>
              <button onClick={handleAddCodexEntry} className="flex-1 py-2 rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-xs font-bold uppercase tracking-widest border border-emerald-500/20">Save</button>
            </div>
          </motion.div>
        ) : (
          <button
            onClick={() => setIsAddingCodex(true)}
            className="w-full py-4 rounded-2xl border border-dashed border-white/10 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30 transition-all flex flex-col items-center justify-center gap-2 group"
          >
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Add New Entry</span>
          </button>
        )}

        <div className="space-y-4">
          {codexEntries.map(entry => (
            <div key={entry.id} className="group p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all overflow-hidden">
              {entry.imageUrl ? (
                <div className="relative h-32 -mx-4 -mt-4 mb-4 overflow-hidden">
                  <img 
                    src={entry.imageUrl} 
                    alt={entry.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <button 
                    onClick={() => handleGenerateCodexImage(entry)}
                    className="absolute bottom-2 right-2 p-1.5 glass-panel rounded-lg text-white/50 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                    title="Regenerate Image"
                  >
                    <RefreshCw className={`w-3 h-3 ${isGeneratingCodexImage === entry.id ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[8px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {entry.category}
                  </span>
                  <div className="flex items-center gap-1">
                    {(entry.category === 'Location' || entry.category === 'Item') && (
                      <button 
                        onClick={() => handleGenerateCodexImage(entry)}
                        disabled={isGeneratingCodexImage === entry.id}
                        className="p-1 text-zinc-600 hover:text-emerald-400 transition-all"
                        title="Generate Image"
                      >
                        {isGeneratingCodexImage === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      </button>
                    )}
                    <button 
                      onClick={() => setConfirmModal({
                        isOpen: true,
                        title: 'Delete Entry',
                        message: `Are you sure you want to delete "${entry.title}"?`,
                        type: 'delete',
                        targetId: entry.id
                      })} 
                      className="p-1 text-zinc-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
              
              {entry.imageUrl && (
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[8px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {entry.category}
                  </span>
                  <button 
                    onClick={() => setConfirmModal({
                      isOpen: true,
                      title: 'Delete Entry',
                      message: `Are you sure you want to delete "${entry.title}"?`,
                      type: 'delete',
                      targetId: entry.id
                    })} 
                    className="p-1 text-zinc-600 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              
              <h4 className="text-sm font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">{entry.title}</h4>
              <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">{entry.content}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
