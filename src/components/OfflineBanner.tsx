import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useOffline } from '../hooks/useOffline';
import { motion, AnimatePresence } from 'motion/react';

interface OfflineBannerProps {
  isSyncing?: boolean;
}

/**
 * ⚡ Bolt Performance Optimization:
 * Memoize OfflineBanner component to prevent unnecessary re-renders.
 * Since this component is placed at the root level of App.tsx, any high-frequency state updates
 * in App (e.g. typing, modal toggling, scenario switching) triggers a re-render of OfflineBanner.
 * Memoizing it ensures that React skips JSX parsing, rendering overhead of Lucide icons, and
 * Framer Motion transition computations unless `isSyncing` or `isOffline` actually changes.
 */
export const OfflineBanner = React.memo(function OfflineBanner({ isSyncing }: OfflineBannerProps) {
  const isOffline = useOffline();

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex flex-col items-center p-2 pointer-events-none gap-2">
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="pointer-events-auto"
          >
            <div className="bg-red-500/90 backdrop-blur-md text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold uppercase tracking-wider border border-red-400/50">
              <WifiOff className="w-4 h-4" />
              <span>You are offline</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSyncing && !isOffline && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="pointer-events-auto"
          >
            <div className="bg-emerald-500/90 backdrop-blur-md text-white px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-emerald-400/50">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Syncing with Cloud...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
