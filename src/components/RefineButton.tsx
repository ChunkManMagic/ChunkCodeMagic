import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wand2, Loader2, X, Send } from 'lucide-react';

interface RefineButtonProps {
  onRefine: (guidance?: string) => Promise<void>;
  isRefining: boolean;
  className?: string;
  label?: string;
}

export function RefineButton({ onRefine, isRefining, className = "", label = "MAGIC REFINE" }: RefineButtonProps) {
  const [showGuided, setShowGuided] = useState(false);
  const [guidance, setGuidance] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowGuided(false);
      }
    };
    if (showGuided) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGuided]);

  const handleRefine = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await onRefine(guidance || undefined);
    setShowGuided(false);
    setGuidance('');
  };

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button 
        onClick={() => setShowGuided(!showGuided)}
        disabled={isRefining}
        className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1 disabled:opacity-50 transition-all group"
      >
        {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3 group-hover:scale-110 transition-transform" />}
        {label}
      </button>

      <AnimatePresence>
        {showGuided && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 z-[100] w-64 glass-panel p-4 rounded-2xl border border-emerald-500/20 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Guided Refine</h4>
              <button onClick={() => setShowGuided(false)} className="text-zinc-500 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>
            
            <form onSubmit={handleRefine} className="space-y-3">
              <textarea
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                placeholder="How should the AI change this? (e.g., 'Make it more aggressive')"
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 min-h-[60px] resize-none"
                autoFocus
              />
              
              <div className="flex flex-wrap gap-1.5">
                {['More descriptive', 'More concise', 'More aggressive'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setGuidance(chip);
                    }}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[9px] text-zinc-400 hover:text-white transition-all"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={isRefining}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
              >
                {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Refine Now
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
