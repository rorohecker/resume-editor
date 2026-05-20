import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToasts } from '@/hooks/useToast';

const TONE_CLASSES: Record<string, string> = {
  info: 'border-paper-edge bg-paper text-ink',
  success: 'border-green-200 bg-green-50 text-ok',
  warn: 'border-yellow-200 bg-yellow-50 text-warn',
  danger: 'border-red-200 bg-red-50 text-danger',
};

export function ToastViewport() {
  const { t } = useTranslation();
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm shadow-page ${TONE_CLASSES[toast.tone]}`}
        >
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="rounded px-2 py-1 text-xs font-medium underline-offset-2 hover:underline"
              onClick={() => {
                toast.action?.onClick();
                dismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            className="rounded-md p-1 opacity-70 hover:opacity-100"
            onClick={() => dismiss(toast.id)}
            aria-label={t('common.dismiss')}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
