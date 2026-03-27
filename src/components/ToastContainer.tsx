import { Toaster } from 'sonner';

export function ToastContainer() {
  return (
    <Toaster 
      position="top-center" 
      toastOptions={{
        className: 'bg-zinc-900 border border-white/10 text-white shadow-2xl rounded-2xl',
        descriptionClassName: 'text-zinc-400',
      }}
    />
  );
}
