import { useState, useEffect, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

let toastId = 0;
let addToastFn: ((type: ToastType, message: string) => void) | null = null;

export function showToast(type: ToastType, message: string) {
  addToastFn?.(type, message);
}

const typeStyles: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: {
    bg: 'bg-emerald-900/80',
    border: 'border-emerald-500/30',
    text: 'text-emerald-300',
    icon: '✓',
  },
  error: {
    bg: 'bg-red-900/80',
    border: 'border-red-500/30',
    text: 'text-red-300',
    icon: '✕',
  },
  info: {
    bg: 'bg-sky-900/80',
    border: 'border-sky-500/30',
    text: 'text-sky-300',
    icon: 'ℹ',
  },
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => {
      addToastFn = null;
    };
  }, [addToast]);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const style = typeStyles[toast.type];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border ${style.border} ${style.bg} px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-right`}
            role="alert"
          >
            <span className={`mt-0.5 text-sm ${style.text}`} aria-hidden="true">
              {style.icon}
            </span>
            <p className={`flex-1 text-sm ${style.text}`}>{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              className="ml-2 text-slate-400 transition hover:text-slate-200"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
