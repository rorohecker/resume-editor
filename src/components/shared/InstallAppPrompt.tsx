import { useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePwaInstall } from '@/hooks/usePwaInstall';

const DISMISS_KEY = 'resume-editor:pwa-install-dismissed';
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function isDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  if (raw === '1') return true;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  if (Date.now() - ts > DISMISS_TTL_MS) {
    localStorage.removeItem(DISMISS_KEY);
    return false;
  }
  return true;
}

export function InstallAppPrompt() {
  const { t } = useTranslation();
  const { canInstall, installing, isStandalone, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(isDismissed);

  if (__APP_SINGLE_FILE__ || isStandalone || dismissed || !canInstall) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleInstall = () => {
    void install().then((accepted) => {
      if (accepted) dismiss();
    });
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-lg border border-accent/30 bg-paper p-4 shadow-page">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Download size={16} />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold text-ink">{t('pwa.installTitle')}</div>
          <p className="mt-1 text-xs text-ink-muted">{t('pwa.installHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary text-xs" onClick={handleInstall} disabled={installing}>
              {installing ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {installing ? t('pwa.installing') : t('pwa.installAction')}
            </button>
            <button type="button" className="btn-ghost text-xs" onClick={dismiss}>
              {t('pwa.installLater')}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="icon-btn h-7 w-7 flex-shrink-0"
          aria-label={t('common.close')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function InstallAppButton({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { canInstall, installing, isStandalone, install } = usePwaInstall();

  if (__APP_SINGLE_FILE__ || isStandalone || !canInstall) return null;

  return (
    <button
      type="button"
      className={compact ? 'btn-ghost text-xs' : 'btn-secondary'}
      onClick={() => void install()}
      disabled={installing}
      aria-label={t('pwa.installAction')}
      title={t('pwa.installAction')}
    >
      {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      {!compact && t('pwa.installAction')}
    </button>
  );
}
