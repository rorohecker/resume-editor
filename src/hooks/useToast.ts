import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warn' | 'danger';
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'> & { ttl?: number }) => string;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: ({ ttl = 3000, ...toast }) => {
    const id = Math.random().toString(36).slice(2, 9);
    set({ toasts: [...get().toasts, { ...toast, id }] });
    if (ttl > 0) window.setTimeout(() => get().dismiss(id), ttl);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));

export function toast(message: string, options: Partial<Omit<Toast, 'message' | 'id'>> & { ttl?: number } = {}): string {
  return useToasts.getState().push({ message, tone: options.tone ?? 'info', action: options.action, ttl: options.ttl });
}
