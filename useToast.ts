import { useState, useCallback, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

const AUTO_DISMISS_MS: Record<ToastType, number> = {
  success: 3000,
  info: 4000,
  warning: 5000,
  error: 7000,
};

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const toast: Toast = { id, message, type };

      setToasts(prev => {
        // Keep max 4 toasts on screen — drop oldest
        const trimmed = prev.length >= 4 ? prev.slice(1) : prev;
        return [...trimmed, toast];
      });

      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS[type]);
      timers.current.set(id, timer);

      return id;
    },
    [dismiss],
  );

  const success = useCallback((msg: string) => show(msg, 'success'), [show]);
  const error = useCallback((msg: string) => show(msg, 'error'), [show]);
  const info = useCallback((msg: string) => show(msg, 'info'), [show]);
  const warning = useCallback((msg: string) => show(msg, 'warning'), [show]);

  return { toasts, show, success, error, info, warning, dismiss };
}
