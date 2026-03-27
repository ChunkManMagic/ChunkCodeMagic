import { toast } from 'sonner';

export function useToast() {
  const toastSuccess = (message: string, description?: string) => {
    toast.success(message, { description });
  };

  const toastError = (message: string, description?: string) => {
    toast.error(message, { description });
  };

  const toastInfo = (message: string, description?: string) => {
    toast.info(message, { description });
  };

  const toastWarning = (message: string, description?: string) => {
    toast.warning(message, { description });
  };

  return {
    toastSuccess,
    toastError,
    toastInfo,
    toastWarning,
  };
}
