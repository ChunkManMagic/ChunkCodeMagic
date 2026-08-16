import { memo, useMemo } from 'react';
import { motion } from 'motion/react';
import { RotateCcw, Edit2, Volume2, RefreshCw, GitBranch, Pin, PinOff, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { AppMode, Message } from '../../lib/types';

export const parseMessageContent = (text: string, role: string) => {
  if (role === 'model') {
    const oocMatch = text.match(/<ooc>([\s\S]*?)<\/ooc>/i);
    if (oocMatch) {
      return {
        mainText: text.replace(/<ooc>[\s\S]*?<\/ooc>/i, '').trim(),
        oocText: oocMatch[1].trim()
      };
    }
  } else if (role === 'user') {
    const noteMatch = text.match(/\[Director's Note: ([\s\S]*?)\]/i);
    if (noteMatch) {
      return {
        mainText: text.replace(/\[Director's Note: [\s\S]*?\]/i, '').trim(),
        oocText: noteMatch[1].trim()
      };
    }
  }
  return { mainText: text, oocText: null };
};

function renderWithDiceRolls(text: string): React.ReactNode {
  if (!text.includes('[ROLL:')) return null;
  const parts = text.split(/(\[ROLL: d\d+\])/g);
  return (
    <span>
      {parts.map((part, i) => {
        const match = part.match(/\[ROLL: (d\d+)\]/);
        if (match) {
          return (
            <span key={i} className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold">
              🎲 Roll {match[1]}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

interface MessageBubbleProps {
  message: Message;
  mode: AppMode;
  // editing
  isEditing: boolean;
  editInput: string;
  onEditInputChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  // regenerating
  isRegenerating: boolean;
  rerollGuidance: string;
  onRerollGuidanceChange: (value: string) => void;
  onRegenerate: () => void;
  onCancelRegenerate: () => void;
  // actions
  onRewind: () => void;
  onEdit: () => void;
  onReadAloud: () => void;
  onRegenerateStart: () => void;
  onBranch: () => void;
  onSwitchVersion: (index: number) => void;
  onDeleteVersion: (index: number) => void;
  onBranchVersion: (index: number) => void;
  onTogglePin: () => void;
  // streaming / search / appearance
  isStreaming: boolean;
  searchHighlighted: boolean;
  flashHighlight?: boolean;
  density: 'compact' | 'comfy';
  activeProvider: string;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  mode,
  isEditing,
  editInput,
  onEditInputChange,
  onEditSave,
  onEditCancel,
  isRegenerating,
  rerollGuidance,
  onRerollGuidanceChange,
  onRegenerate,
  onCancelRegenerate,
  onRewind,
  onEdit,
  onReadAloud,
  onRegenerateStart,
  onBranch,
  onSwitchVersion,
  onDeleteVersion,
  onBranchVersion,
  onTogglePin,
  isStreaming,
  searchHighlighted,
  flashHighlight,
  density,
  activeProvider
}: MessageBubbleProps) {
  const msg = message;
  const isUser = msg.role === 'user';

  const content = useMemo(() => parseMessageContent(msg.text, msg.role), [msg.text, msg.role]);

  const bubblePadding = density === 'compact' ? 'px-4 py-2.5' : 'px-6 py-4';

  return (
    <motion.div
      key={msg.id}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      data-message-id={msg.id}
      className={`flex group relative ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {/* Search highlight ring */}
      {searchHighlighted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`absolute inset-0 rounded-[1.75rem] pointer-events-none z-20 border-2 ${isUser ? 'border-emerald-300' : 'border-amber-300'}`}
          style={{ boxShadow: `0 0 0 6px rgba(245, 158, 11, 0.25)` }}
        />
      )}

      {/* Flash highlight when jumping to a pinned/match message */}
      {flashHighlight && (
        <motion.div
          key={`flash-${msg.id}`}
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          className={`absolute inset-0 rounded-[1.75rem] pointer-events-none z-20 border-2 ${isUser ? 'border-emerald-300' : 'border-amber-300'}`}
          style={{ boxShadow: '0 0 0 6px rgba(245, 158, 11, 0.25)' }}
        />
      )}

      {/* Desktop Actions (Hover-only on MD and up) */}
      <div className={`hidden md:flex absolute -top-6 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1.5 z-10 ${isUser ? 'right-0' : 'left-0'}`}>
        <button onClick={onRewind} className="p-1.5 glass-panel rounded-lg text-zinc-300 hover:text-red-400 transition-colors" title="Rewind to here"><RotateCcw className="w-3.5 h-3.5" /><span className="hidden lg:inline ml-1 text-[8px] uppercase tracking-wider">Rewind</span></button>
        <button onClick={onEdit} className="p-1.5 glass-panel rounded-lg text-zinc-300 hover:text-emerald-400 transition-colors" title="Edit message"><Edit2 className="w-3.5 h-3.5" /><span className="hidden lg:inline ml-1 text-[8px] uppercase tracking-wider">Edit</span></button>
        {!isUser && (
          <>
            <button onClick={onReadAloud} className="p-1.5 glass-panel rounded-lg text-zinc-300 hover:text-blue-400 transition-colors" title="Read aloud"><Volume2 className="w-3.5 h-3.5" /><span className="hidden lg:inline ml-1 text-[8px] uppercase tracking-wider">Read</span></button>
            <button onClick={onRegenerateStart} className="p-1.5 glass-panel rounded-lg text-zinc-300 hover:text-emerald-400 transition-colors" title="Regenerate message"><RefreshCw className="w-3.5 h-3.5" /><span className="hidden lg:inline ml-1 text-[8px] uppercase tracking-wider">Regen</span></button>
            <button onClick={onBranch} className="p-1.5 glass-panel rounded-lg text-zinc-300 hover:text-purple-400 transition-colors" title="Branch scenario from here"><GitBranch className="w-3.5 h-3.5" /><span className="hidden lg:inline ml-1 text-[8px] uppercase tracking-wider">Branch</span></button>
          </>
        )}
        <button
          onClick={onTogglePin}
          className={`p-1.5 glass-panel rounded-lg transition-colors ${msg.isPinned ? 'text-amber-400' : 'text-zinc-300 hover:text-amber-400'}`}
          title={msg.isPinned ? 'Unpin message' : 'Pin message'}
        >
          {msg.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          <span className="hidden lg:inline ml-1 text-[8px] uppercase tracking-wider">{msg.isPinned ? 'Pinned' : 'Pin'}</span>
        </button>
        {msg.timestamp && <span className="text-[10px] text-zinc-400 font-mono px-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      {/* Message Bubble + Mobile Actions column */}
      <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`w-full rounded-[1.5rem] ${bubblePadding} shadow-xl ${isUser ? 'bg-emerald-600 text-white rounded-tr-none' : 'glass-panel text-zinc-200 rounded-tl-none'}`}>
          {isEditing ? (
            <div className="space-y-3 min-w-[280px]">
              <textarea value={editInput} onChange={(e) => onEditInputChange(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" rows={4} autoFocus />
              <div className="flex justify-end gap-3">
                <button onClick={onEditCancel} className="text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-widest">Cancel</button>
                <button onClick={onEditSave} className="text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-widest">Save</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {content.mainText && (
                  mode === AppMode.GAME && content.mainText.includes('[ROLL:')
                    ? <div className="text-[15px] leading-relaxed">{renderWithDiceRolls(content.mainText)}</div>
                    : <div className={`prose prose-invert max-w-none text-[15px] leading-relaxed ${!isUser ? 'narrative-text' : ''}`}>
                        <ReactMarkdown>{content.mainText}</ReactMarkdown>
                        {isStreaming && <span className="inline-block w-1.5 h-4 bg-emerald-400/80 align-middle ml-1 animate-pulse rounded-sm" />}
                      </div>
                )}

                {/* Version Switcher */}
                {!isUser && msg.versions && msg.versions.length > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-black/40 rounded-lg p-1 border border-white/10 shadow-inner">
                        <button
                          onClick={() => onSwitchVersion((msg.activeVersionIndex || 0) - 1)}
                          disabled={(msg.activeVersionIndex || 0) <= 0}
                          className="p-1 text-zinc-500 hover:text-emerald-400 disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[10px] font-mono font-bold text-zinc-400 min-w-[3rem] text-center tracking-widest">
                          {(msg.activeVersionIndex || 0) + 1} / {msg.versions.length}
                        </span>
                        <button
                          onClick={() => onSwitchVersion((msg.activeVersionIndex || 0) + 1)}
                          disabled={(msg.activeVersionIndex || 0) >= msg.versions.length - 1}
                          className="p-1 text-zinc-500 hover:text-emerald-400 disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onBranchVersion(msg.activeVersionIndex || 0)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/20 transition-all group"
                          title="Branch this version to new Scenario"
                        >
                          <GitBranch className="w-3 h-3 group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Branch</span>
                        </button>
                        <button
                          onClick={() => onDeleteVersion(msg.activeVersionIndex || 0)}
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400/70 hover:text-red-400 rounded-lg border border-red-500/10 transition-all"
                          title="Delete version"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em] italic opacity-60">
                      Alternate Drafts
                    </div>
                  </div>
                )}

                {content.oocText && (
                  <div className={`text-sm p-3 rounded-xl border ${isUser ? 'bg-emerald-700/30 border-emerald-500/30 text-emerald-100' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300'}`}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-70">
                      {isUser ? "Director's Note" : "OOC Reply"}
                    </div>
                    <div className="prose prose-invert max-w-none text-sm">
                      <ReactMarkdown>{content.oocText}</ReactMarkdown>
                    </div>
                  </div>
                )}
                {!isUser && (
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest text-right mt-1 opacity-50">
                    Generated by {activeProvider}
                  </div>
                )}
                {isRegenerating && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 pt-3 border-t border-white/10">
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={rerollGuidance}
                        onChange={(e) => onRerollGuidanceChange(e.target.value)}
                        placeholder='Optional: Guide the rewrite (e.g., "Make it more aggressive", "Focus on the environment").'
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-zinc-600"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onRegenerate();
                          } else if (e.key === 'Escape') {
                            onCancelRegenerate();
                          }
                        }}
                      />
                      <div className="flex justify-end gap-2 mt-1">
                        <button onClick={onCancelRegenerate} className="px-3 py-1.5 text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-widest rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
                        <button onClick={onRegenerate} className="px-3 py-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-widest bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3" />
                          Confirm Reroll
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Mobile/Touch Actions */}
        <div className="flex flex-wrap md:hidden mt-2 items-center gap-1.5 px-1 opacity-80 z-10">
          <button onClick={onRewind} className="p-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-lg text-zinc-300 active:bg-zinc-700 active:text-red-400 transition-colors flex items-center gap-1 shadow-md" title="Rewind to here">
            <RotateCcw className="w-3 h-3" />
            <span className="text-[8px] font-bold uppercase tracking-wider">Rewind</span>
          </button>
          <button onClick={onEdit} className="p-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-lg text-zinc-300 active:bg-zinc-700 active:text-emerald-400 transition-colors flex items-center gap-1 shadow-md" title="Edit message">
            <Edit2 className="w-3 h-3" />
            <span className="text-[8px] font-bold uppercase tracking-wider">Edit</span>
          </button>
          {!isUser && (
            <>
              <button onClick={onReadAloud} className="p-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-lg text-zinc-300 active:bg-zinc-700 active:text-blue-400 transition-colors flex items-center gap-1 shadow-md" title="Read aloud">
                <Volume2 className="w-3 h-3" />
                <span className="text-[8px] font-bold uppercase tracking-wider">Read</span>
              </button>
              <button onClick={onRegenerateStart} className="p-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-lg text-zinc-300 active:bg-zinc-700 active:text-emerald-400 transition-colors flex items-center gap-1 shadow-md" title="Regenerate message">
                <RefreshCw className="w-3 h-3" />
                <span className="text-[8px] font-bold uppercase tracking-wider">Regen</span>
              </button>
              <button onClick={onBranch} className="p-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-lg text-zinc-300 active:bg-zinc-700 active:text-purple-400 transition-colors flex items-center gap-1 shadow-md" title="Branch scenario from here">
                <GitBranch className="w-3 h-3" />
                <span className="text-[8px] font-bold uppercase tracking-wider">Branch</span>
              </button>
            </>
          )}
          <button
            onClick={onTogglePin}
            className={`p-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-lg transition-colors flex items-center gap-1 shadow-md ${msg.isPinned ? 'text-amber-400' : 'text-zinc-300 active:text-amber-400'}`}
            title={msg.isPinned ? 'Unpin message' : 'Pin message'}
          >
            {msg.isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            <span className="text-[8px] font-bold uppercase tracking-wider">{msg.isPinned ? 'Pinned' : 'Pin'}</span>
          </button>
          {msg.timestamp && <span className="text-[8px] text-zinc-500 font-mono ml-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
      </div>
    </motion.div>
  );
});


