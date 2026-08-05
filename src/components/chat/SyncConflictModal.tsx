import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Database, Cloud, ArrowRight } from 'lucide-react';

interface SyncConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  localTime: number;
  remoteTime: number;
  onKeepLocal: () => void;
  onKeepCloud: () => void;
}

export function SyncConflictModal({
  isOpen,
  onClose,
  localTime,
  remoteTime,
  onKeepLocal,
  onKeepCloud,
}: SyncConflictModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', duration: 0.3 }}
          className="relative w-full max-w-lg overflow-hidden glass-panel border border-amber-500/30 rounded-[2rem] p-8 shadow-[0_20px_50px_rgba(245,158,11,0.15)] flex flex-col gap-6"
        >
          {/* Header */}
          <div className="flex items-center gap-4 border-b border-white/5 pb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">Sync Conflict Detected</h3>
              <p className="text-xs text-zinc-500">Your offline changes do not match the cloud version.</p>
            </div>
          </div>

          {/* Conflict comparison card */}
          <div className="grid grid-cols-2 gap-4">
            {/* Local Card */}
            <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-3 hover:border-emerald-500/20 transition-colors group">
              <div className="flex items-center gap-2 text-zinc-400 group-hover:text-emerald-400 transition-colors">
                <Database className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Local Device</span>
              </div>
              <div className="text-sm font-semibold text-white">Dexie.js Draft</div>
              <div className="text-[10px] text-zinc-500 font-mono">
                Last modified:<br />
                {new Date(localTime).toLocaleString()}
              </div>
              <button
                onClick={onKeepLocal}
                className="mt-2 w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl uppercase tracking-wider transition-all"
              >
                Keep Local
              </button>
            </div>

            {/* Cloud Card */}
            <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-3 hover:border-blue-500/20 transition-colors group">
              <div className="flex items-center gap-2 text-zinc-400 group-hover:text-blue-400 transition-colors">
                <Cloud className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Cloud Sync</span>
              </div>
              <div className="text-sm font-semibold text-white">Firestore State</div>
              <div className="text-[10px] text-zinc-500 font-mono">
                Last modified:<br />
                {remoteTime ? new Date(remoteTime).toLocaleString() : 'Unknown'}
              </div>
              <button
                onClick={onKeepCloud}
                className="mt-2 w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-xs font-bold rounded-xl uppercase tracking-wider transition-all"
              >
                Pull Cloud
              </button>
            </div>
          </div>

          {/* Description */}
          <div className="text-xs text-zinc-400 leading-relaxed bg-black/40 border border-white/5 p-4 rounded-xl flex gap-2.5 items-start">
            <ArrowRight className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              If you keep the **Local Device** version, your local draft will override your Firestore cloud session. If you choose **Cloud Sync**, local modifications will be replaced by your cloud state.
            </span>
          </div>

          {/* Footer actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-wider transition-colors"
            >
              Decide Later
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
