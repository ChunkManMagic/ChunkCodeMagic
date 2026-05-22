import { motion } from 'motion/react';
import { Cloud, GitBranch, Trash2, ArrowRight, Monitor, Smartphone } from 'lucide-react';
import { Scenario } from '../lib/types';

interface SyncConflictModalProps {
  localScenario: Scenario;
  remoteScenario: Scenario;
  onResolve: (choice: 'local' | 'remote' | 'branch' | 'delete-local' | 'delete-remote') => void;
}

export function SyncConflictModal({ localScenario, remoteScenario, onResolve }: SyncConflictModalProps) {
  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isLocalNewer = localScenario.lastUpdated > remoteScenario.lastUpdated;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-2xl glass-panel p-8 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden"
      >
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1/2 bg-amber-500/10 blur-[100px] pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center border border-amber-500/20">
              <GitBranch className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h2 className="text-2xl font-serif text-white">Sync Conflict Detected</h2>
              <p className="text-zinc-400 text-sm italic">Scenario: "{localScenario.profile.name}"</p>
            </div>
          </div>

          <p className="text-zinc-300 mb-8 leading-relaxed">
            Your local data and cloud save have diverged. Which version would you like to keep, or would you like to fork them into separate timelines?
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* Local Version */}
            <button
              onClick={() => onResolve('local')}
              className={`p-6 rounded-3xl border text-left transition-all group relative overflow-hidden ${
                isLocalNewer 
                  ? 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-zinc-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Local Storage</span>
                </div>
                {isLocalNewer && (
                  <span className="text-[8px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">NEWER</span>
                )}
              </div>
              <div className="text-lg font-bold text-white mb-1">{localScenario.profile.name}</div>
              <div className="text-xs text-zinc-500">{formatDate(localScenario.lastUpdated)}</div>
              <div className="mt-4 flex items-center text-[10px] font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                USE THIS VERSION <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </button>

            {/* Remote Version */}
            <button
              onClick={() => onResolve('remote')}
              className={`p-6 rounded-3xl border text-left transition-all group relative overflow-hidden ${
                !isLocalNewer 
                  ? 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-zinc-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Cloud Save</span>
                </div>
                {!isLocalNewer && (
                  <span className="text-[8px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">NEWER</span>
                )}
              </div>
              <div className="text-lg font-bold text-white mb-1">{remoteScenario.profile.name}</div>
              <div className="text-xs text-zinc-500">{formatDate(remoteScenario.lastUpdated)}</div>
              <div className="mt-4 flex items-center text-[10px] font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                USE THIS VERSION <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => onResolve('branch')}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all font-bold uppercase tracking-widest text-xs"
            >
              <GitBranch className="w-4 h-4" />
              Keep Both (Branch Scenario)
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => onResolve('delete-local')}
                className="p-4 rounded-2xl bg-red-500/5 hover:bg-red-500/10 text-red-400/50 hover:text-red-400 border border-red-500/10 transition-all"
                title="Discard Local Version"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onResolve('delete-remote')}
                className="p-4 rounded-2xl bg-red-500/5 hover:bg-red-500/10 text-red-400/50 hover:text-red-400 border border-red-500/10 transition-all"
                title="Discard Cloud Version"
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
              Tip: Local storage is only available on this device. Cloud saves sync everywhere.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
