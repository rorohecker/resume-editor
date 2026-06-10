import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useStore } from '@/store';
import { Modal } from '@/components/shared/Modal';
import { toast } from '@/hooks/useToast';
import { buildShareUrl } from '@/utils/shareLink';

// Above this length a QR code becomes too dense to scan reliably, so we show
// the link only and explain why.
const QR_MAX_URL_LENGTH = 1800;

export function ShareModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.shareOpen);
  const setOpen = useStore((s) => s.setShareOpen);
  const resume = useStore((s) => s.currentResume);

  const [url, setUrl] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';

  useEffect(() => {
    if (!open || !resume) return;
    let cancelled = false;
    setBuilding(true);
    setQr(null);
    setUrl('');
    void (async () => {
      try {
        const link = await buildShareUrl(resume);
        if (cancelled) return;
        setUrl(link);
        if (link.length <= QR_MAX_URL_LENGTH) {
          try {
            const QRCode = (await import('qrcode')).default;
            const dataUrl = await QRCode.toDataURL(link, { errorCorrectionLevel: 'L', margin: 1, width: 240 });
            if (!cancelled) setQr(dataUrl);
          } catch {
            if (!cancelled) setQr(null);
          }
        }
      } catch {
        if (!cancelled) toast(t('share.buildFailed', { defaultValue: 'Could not build a share link.' }), { tone: 'danger' });
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, resume, t]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('share.copied', { defaultValue: 'Link copied' }), { tone: 'success', ttl: 1500 });
    } catch {
      toast(t('editor.copyFailed', { defaultValue: 'Could not copy to clipboard' }), { tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t('share.title', { defaultValue: 'Share read-only link' })}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(false)}>
            {t('common.done', { defaultValue: 'Done' })}
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-sm text-ink-muted">
          {t('share.intro', {
            defaultValue:
              'This creates a link that contains your entire resume encoded in the URL — no server, no account. Anyone with the link can view (and print) it, but not edit your copy.',
          })}
        </p>

        {building ? (
          <div className="flex items-center gap-2 text-sm text-ink-subtle">
            <Loader2 size={14} className="animate-spin" /> {t('share.building', { defaultValue: 'Building link…' })}
          </div>
        ) : (
          <>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="input flex-1 text-xs"
              />
              <button type="button" className="btn-primary shrink-0 text-sm" onClick={() => void copy()}>
                <Copy size={14} /> {t('common.copy', { defaultValue: 'Copy' })}
              </button>
            </div>

            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                <ExternalLink size={12} /> {t('share.openPreview', { defaultValue: 'Open the read-only view' })}
              </a>
            )}

            {qr ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-paper-edge bg-paper-tint p-4">
                <img src={qr} alt="Share QR code" className="h-44 w-44 rounded bg-white p-2" />
                <span className="text-xs text-ink-subtle">{t('share.qrHint', { defaultValue: 'Scan to open on a phone' })}</span>
              </div>
            ) : (
              url && (
                <p className="rounded-md bg-paper-tint px-3 py-2 text-xs text-ink-subtle">
                  {t('share.qrTooBig', {
                    defaultValue:
                      'This resume is too large for a scannable QR code — use the link instead.',
                  })}
                </p>
              )
            )}

            {isFileProtocol && (
              <p className="rounded-md bg-warn/10 px-3 py-2 text-xs text-warn">
                {t('share.fileWarning', {
                  defaultValue:
                    'You are running from a local file, so this link only opens on this computer. Host the app online for links that work anywhere.',
                })}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
