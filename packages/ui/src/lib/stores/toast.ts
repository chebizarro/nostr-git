import { writable } from "svelte/store";

// Compatible with app's ToastParams interface
export interface Toast {
  message?: string;
  timeout?: number;
  theme?: "error";
  // Legacy support for existing usage
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | string;
  duration?: number;
}

function createToastStore() {
  const { subscribe, update, set } = writable<Toast[]>([]);

  function push(toast: Toast) {
    // Normalize toast format - convert legacy format to new format
    const normalizedToast: Toast = {
      message:
        toast.message ||
        (toast.title && toast.description
          ? `${toast.title}: ${toast.description}`
          : toast.title || toast.description || ""),
      timeout: toast.timeout || toast.duration,
      theme: toast.theme || (toast.variant === "destructive" ? "error" : undefined),
      // Keep legacy fields for backward compatibility
      ...toast,
    };

    update((toasts) => [...toasts, normalizedToast]);
    // Optionally auto-remove after timeout/duration
    const timeout = normalizedToast.timeout || normalizedToast.duration;
    if (timeout && timeout > 0) {
      setTimeout(() => {
        update((toasts) => toasts.slice(1));
      }, timeout);
    }
  }

  function clear() {
    set([]);
  }

  return {
    subscribe,
    push,
    clear,
  };
}

export const toast = createToastStore();
