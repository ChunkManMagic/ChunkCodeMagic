import { motion, AnimatePresence } from 'motion/react';
import { WifiOff } from 'lucide-react';

interface OfflineBannerProps {
  isOffline: boolean;
}

export function OfflineBanner({ isOffline }: OfflineBannerProps) {
  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-0 inset-x-0 z-[300] flex items-center justify-center gap-2
            py-2 px-4 bg-amber-500/90 backdrop-blur text-amber-950 text-sm font-semibold"
          role="alert"
        >
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>You're offline — AI features unavailable until you reconnect.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
