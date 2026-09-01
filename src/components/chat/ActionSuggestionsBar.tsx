import { memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, MessageSquare, Compass, Zap, Search, RefreshCw, X, Loader2, Command } from 'lucide-react';
import type { ActionSuggestion } from '../../lib/gemini';

interface ActionSuggestionsBarProps {
  suggestions: ActionSuggestion[];
  isLoading: boolean;
  isOpen: boolean;
  onSelectSuggestion: (text: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

export const ActionSuggestionsBar = memo(function ActionSuggestionsBar({
  suggestions,
  isLoading,
  isOpen,
  onSelectSuggestion,
  onRefresh,
  onClose,
}: ActionSuggestionsBarProps) {
  // Global keydown handler when suggestions bar is active
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // If user presses 1, 2, 3 while holding Alt or when active
      if ((e.altKey || e.ctrlKey || e.metaKey) && ['1', '2', '3'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (suggestions[idx]) {
          e.preventDefault();
          onSelectSuggestion(suggestions[idx].text);
        }
        return;
      }

      // Alt+R for reroll
      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (!isLoading) onRefresh();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, suggestions, isLoading, onSelectSuggestion, onRefresh, onClose]);

  if (!isOpen && suggestions.length === 0) return null;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'dialogue':
        return <MessageSquare className="w-3 h-3 text-emerald-400" />;
      case 'bold':
        return <Zap className="w-3 h-3 text-amber-400" />;
      case 'investigate':
        return <Search className="w-3 h-3 text-blue-400" />;
      case 'action':
      default:
        return <Compass className="w-3 h-3 text-purple-400" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'dialogue':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
      case 'bold':
        return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
      case 'investigate':
        return 'border-blue-500/30 bg-blue-500/10 text-blue-400';
      case 'action':
      default:
        return 'border-purple-500/30 bg-purple-500/10 text-purple-400';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: 10, height: 0 }}
          className="mb-3 overflow-hidden rounded-2xl border border-emerald-500/20 bg-zinc-950/85 backdrop-blur-xl p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">
                AI Next Action Suggestions
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-zinc-400 font-mono">
                <Command className="w-2.5 h-2.5" /> / Ctrl+Space
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                title="Generate new suggestions (Alt+R)"
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-1 px-2 text-[9px] font-bold uppercase tracking-wider"
              >
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                <span>Reroll</span>
                <kbd className="hidden sm:inline text-[8px] bg-white/10 px-1 rounded text-zinc-400 font-mono">Alt+R</kbd>
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Dismiss suggestions (Esc)"
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <kbd className="hidden sm:inline text-[8px] bg-white/10 px-1 rounded text-zinc-400 font-mono">Esc</kbd>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {isLoading && suggestions.length === 0 ? (
            <div className="flex items-center justify-center py-4 gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Contemplating next actions based on current scene...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onSelectSuggestion(suggestion.text)}
                  className="group relative flex flex-col items-start justify-between text-left p-2.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-emerald-500/[0.08] hover:border-emerald-500/30 transition-all shadow-sm"
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1.5 w-full">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border uppercase tracking-wider ${getTypeBadge(suggestion.type)}`}>
                      {getTypeIcon(suggestion.type)}
                      {suggestion.label || suggestion.type}
                    </span>
                    <span className="text-[9px] font-mono font-bold text-zinc-400 group-hover:text-emerald-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                      Alt+{index + 1}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 group-hover:text-white line-clamp-2 leading-relaxed font-sans">
                    {suggestion.text}
                  </p>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-400/0 group-hover:text-emerald-400/80 transition-opacity mt-1.5 self-end">
                    Click to Use &rarr;
                  </span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});
