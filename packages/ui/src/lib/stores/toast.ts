import { writable } from "svelte/store";

export interface Toast {
  title: string;
  description?: string;
  variant?: "default" | "destructive" | string;
  duration?: number;
}

function createToastStore() {
  const { subscribe, update, set } = writable<Toast[]>([]);

  function push(toast: Toast) {
    update((toasts) => [...toasts, toast]);
    // Optionally auto-remove after duration
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        update((toasts) => toasts.slice(1));
      }, toast.duration);
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
