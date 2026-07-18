import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCopy, FileText, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/useToast';
import { useStore } from '@/store';
import {
  deleteImportReference,
  loadImportReference,
  type ImportReference,
} from '@/utils/importReference';

export function ImportReferencePanel({ resumeId }: { resumeId: string }) {
  const { t } = useTranslation();
  const open = useStore((state) => state.importReferenceOpen);
  const setOpen = useStore((state) => state.setImportReferenceOpen);
  const setAvailable = useStore((state) => state.setImportReferenceAvailable);
  const [reference, setReference] = useState<ImportReference | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const lastErrorToastAt = useRef(0);

  const notifyLoadError = useCallback(() => {
    setLoadError(true);
    setAvailable(false);
    const now = Date.now();
    if (now - lastErrorToastAt.current < 8000) return;
    lastErrorToastAt.current = now;
    toast(t('importReference.loadFailed'), { tone: 'danger', ttl: 5000 });
  }, [setAvailable, t]);

  useEffect(() => {
    let cancelled = false;
    setReference(null);
    setLoadError(false);
    setLoading(true);
    setAvailable(false);

    void loadImportReference(resumeId).then(({ reference: loaded, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) {
        notifyLoadError();
        setOpen(false);
        return;
      }
      setReference(loaded);
      setAvailable(Boolean(loaded));
      // Don't leave the panel open against a resume that has no source text.
      if (!loaded) setOpen(false);
    });

    return () => {
      cancelled = true;
    };
  }, [resumeId, setAvailable, setOpen, notifyLoadError]);

  // Re-read when the panel opens. This also picks up a source that was just
  // added through "Import & merge" while the editor stayed mounted.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void loadImportReference(resumeId).then(({ reference: loaded, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) {
        notifyLoadError();
        return;
      }
      setLoadError(false);
      setReference(loaded);
      setAvailable(Boolean(loaded));
      if (!loaded) setOpen(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, resumeId, setAvailable, setOpen, notifyLoadError]);

  const copyAll = async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference.text);
      toast(t('importReference.copied'), { tone: 'success', ttl: 1500 });
    } catch {
      toast(t('editor.copyFailed'), { tone: 'danger' });
    }
  };

  const clearReference = () => {
    if (!window.confirm(t('importReference.clearConfirm'))) return;
    deleteImportReference(resumeId);
    setReference(null);
    setAvailable(false);
    setOpen(false);
    toast(t('importReference.cleared'), { tone: 'info', ttl: 1500 });
  };

  if (!open) return null;

  return (
    <>
      {/* Mobile: tap outside to dismiss the full-screen reference overlay. */}
      <button
        type="button"
        className="fixed inset-0 z-20 bg-ink/30 md:hidden print:hidden"
        aria-label={t('common.close')}
        onClick={() => setOpen(false)}
      />
      <aside
        className="fixed inset-x-0 bottom-0 top-14 z-30 flex min-h-0 flex-col border-r border-paper-edge bg-paper shadow-page md:static md:z-auto md:w-[28%] md:min-w-64 md:max-w-sm md:shadow-none print:hidden"
        aria-label={t('importReference.title')}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-paper-edge px-3 py-2">
          <FileText size={15} className="text-ink-muted" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-ink">
              {t('importReference.title')}
            </h2>
            {reference?.sourceName && (
              <p className="truncate text-[10px] text-ink-subtle">{reference.sourceName}</p>
            )}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void copyAll()}
            disabled={!reference}
            title={t('importReference.copyAll')}
            aria-label={t('importReference.copyAll')}
          >
            <ClipboardCopy size={14} />
          </button>
          <button
            type="button"
            className="icon-btn text-danger"
            onClick={clearReference}
            disabled={!reference}
            title={t('importReference.clear')}
            aria-label={t('importReference.clear')}
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setOpen(false)}
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={15} />
          </button>
        </div>

        <p className="shrink-0 border-b border-paper-edge bg-paper-tint px-3 py-2 text-[11px] text-ink-subtle">
          {t('importReference.hint')}
        </p>

        {loadError ? (
          <div
            className="m-3 rounded-md border border-paper-edge bg-paper-tint p-3 text-xs text-danger"
            role="alert"
          >
            {t('importReference.loadFailed')}
          </div>
        ) : loading && !reference ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-ink-subtle">
            {t('editor.loading')}
          </div>
        ) : reference ? (
          <textarea
            readOnly
            value={reference.text}
            className="min-h-0 flex-1 resize-none border-0 bg-paper p-4 font-mono text-xs leading-relaxed text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            aria-label={t('importReference.sourceText')}
            spellCheck={false}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink-subtle">
            {t('importReference.empty')}
          </div>
        )}
      </aside>
      <div className="hidden w-px shrink-0 bg-paper-edge md:block" />
    </>
  );
}
