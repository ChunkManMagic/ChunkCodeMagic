import { motion } from 'motion/react';
import { Pin, PinOff, CornerDownRight, BookmarkX } from 'lucide-react';
import { Message, AppMode } from '../../lib/types';
import { parseMessageContent } from './messageContent';

interface PinnedMessagesPanelProps {
  messages: Message[];
  mode: AppMode;
  onJumpTo: (messageId: string) => void;
  onTogglePin: (messageId: string) => void;
  onClose: () => void;
}

export function PinnedMessagesPanel({ messages, mode, onJumpTo, onTogglePin, onClose }: PinnedMessagesPanelProps) {
  const pinned = messages.filter(m => m.isPinned);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="absolute left-4 top-4 bottom-4 z-30 w-72 md:w-80 glass-panel rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/20">
        <div className="flex items-center gap-2">
          <Pin className="w-3.5 h-3.5 text-amber-400" />
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">
            Pinned Moments
          </h4>
          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-bold">
            {pinned.length}
          </span>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors" title="Close pinned moments">
          <BookmarkX className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {pinned.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4">
            <Pin className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-xs text-zinc-500">No pinned moments yet.</p>
            <p className="text-[10px] text-zinc-600 mt-1">Use the pin button on any message to bookmark key story moments.</p>
          </div>
        ) : (
          pinned.map(msg => {
            const { mainText } = parseMessageContent(msg.text, msg.role);
            const preview = mainText.replace(/\s+/g, ' ').trim().slice(0, 120);
            return (
              <div
                key={msg.id}
                className="group bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl p-3 transition-all cursor-pointer"
                onClick={() => onJumpTo(msg.id)}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                    msg.role === 'user'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : mode === AppMode.GAME ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {msg.role === 'user' ? 'You' : mode === AppMode.GAME ? 'DM' : 'AI'}
                  </span>
                  <span className="text-[8px] text-zinc-600 font-mono">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onTogglePin(msg.id); }}
                    className="ml-auto p-1 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Unpin message"
                  >
                    <PinOff className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-3 italic">{preview || '(empty message)'}</p>
                <div className="flex items-center gap-1 mt-1.5 text-[9px] font-bold uppercase tracking-widest text-amber-400/80">
                  <CornerDownRight className="w-2.5 h-2.5" />
                  Jump to moment
                </div>
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
