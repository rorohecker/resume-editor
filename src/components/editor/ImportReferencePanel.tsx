import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCopy, FileText, PanelLeftOpen, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { formatDateRange } from '@/utils/dateFormat';
import { parseResumeText } from '@/utils/importParser';
import {
  deleteImportReference,
  isPreviewableOriginal,
  loadImportReference,
  type ImportReference,
} from '@/utils/importReference';
import type { Resume, Section } from '@/types';
import { OriginalDocumentPreview } from './OriginalDocumentPreview';

type ViewMode = 'preview' | 'layout' | 'source';

export function ImportReferencePanel({ resumeId }: { resumeId: string }) {
  const { t } = useTranslation();
  const open = useStore((state) => state.importReferenceOpen);
  const setOpen = useStore((state) => state.setImportReferenceOpen);
  const setAvailable = useStore((state) => state.setImportReferenceAvailable);
  const available = useStore((state) => state.importReferenceAvailable);
  const epoch = useStore((state) => state.importReferenceEpoch);
  const [reference, setReference] = useState<ImportReference | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const lastErrorToastAt = useRef(0);
  const hasOriginal = isPreviewableOriginal(reference?.original);

  const notifyLoadError = useCallback(() => {
    setLoadError(true);
    setAvailable(false);
    const now = Date.now();
    if (now - lastErrorToastAt.current < 8000) return;
    lastErrorToastAt.current = now;
    toast(t('importReference.loadFailed'), { tone: 'danger', ttl: 5000 });
  }, [setAvailable, t]);

  // Load whenever the resume changes or a new import bumps the epoch.
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
      if (!loaded) setOpen(false);
      else setViewMode(isPreviewableOriginal(loaded.original) ? 'preview' : 'layout');
    });

    return () => {
      cancelled = true;
    };
  }, [resumeId, epoch, setAvailable, setOpen, notifyLoadError]);

  const parsedResume: Resume | null = useMemo(() => {
    if (!reference?.text.trim()) return null;
    try {
      return parseResumeText(reference.text, reference.sourceName ?? 'Imported Resume').resume;
    } catch {
      return null;
    }
  }, [reference]);

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

  if (!open && available) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-r-md border border-l-0 border-paper-edge bg-paper px-1.5 py-3 text-[10px] font-semibold uppercase tracking-wide text-ink shadow-page hover:bg-paper-tint print:hidden"
        title={t('importReference.toggle')}
        aria-label={t('importReference.toggle')}
      >
        <PanelLeftOpen size={14} />
        <span className="max-h-28 overflow-hidden [writing-mode:vertical-rl] rotate-180">
          {t('importReference.title')}
        </span>
      </button>
    );
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-20 bg-ink/30 md:hidden print:hidden"
        aria-label={t('common.close')}
        onClick={() => setOpen(false)}
      />
      <aside
        className="fixed inset-x-0 bottom-0 top-14 z-30 flex min-h-0 flex-col border-r border-paper-edge bg-paper shadow-page md:static md:z-auto md:w-[32%] md:min-w-72 md:max-w-md md:shadow-none print:hidden"
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
            title={t('importReference.hide')}
            aria-label={t('importReference.hide')}
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-paper-edge bg-paper-tint p-1.5">
          {hasOriginal && (
            <button
              type="button"
              className={`flex-1 rounded px-2 py-1 text-[11px] font-medium ${
                viewMode === 'preview' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
              onClick={() => setViewMode('preview')}
              aria-pressed={viewMode === 'preview'}
            >
              {t('importReference.viewOriginal')}
            </button>
          )}
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1 text-[11px] font-medium ${
              viewMode === 'layout' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
            onClick={() => setViewMode('layout')}
            aria-pressed={viewMode === 'layout'}
          >
            {t('importReference.viewPreview')}
          </button>
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1 text-[11px] font-medium ${
              viewMode === 'source' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
            onClick={() => setViewMode('source')}
            aria-pressed={viewMode === 'source'}
          >
            {t('importReference.viewSource')}
          </button>
        </div>

        <p className="shrink-0 border-b border-paper-edge px-3 py-2 text-[11px] text-ink-subtle">
          {hasOriginal ? t('importReference.hintOriginal') : t('importReference.hint')}
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
          viewMode === 'preview' && reference.original && hasOriginal ? (
            <OriginalDocumentPreview original={reference.original} />
          ) : viewMode === 'layout' && parsedResume ? (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <RenderedImportResume resume={parsedResume} />
            </div>
          ) : (
            <textarea
              readOnly
              value={reference.text}
              className="min-h-0 flex-1 resize-none border-0 bg-paper p-4 font-mono text-xs leading-relaxed text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              aria-label={t('importReference.sourceText')}
              spellCheck={false}
            />
          )
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

/** Compact, selectable resume layout sized for the reference sidebar. */
function RenderedImportResume({ resume }: { resume: Resume }) {
  const sections = resume.sections
    .filter((section) => section.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <article className="select-text space-y-4 text-[12px] leading-snug text-ink">
      <header className="space-y-1 border-b border-paper-edge pb-3">
        {resume.header.name && (
          <h3 className="text-base font-semibold tracking-tight text-ink">{resume.header.name}</h3>
        )}
        {resume.header.contactFields.length > 0 && (
          <p className="text-[11px] text-ink-muted">
            {resume.header.contactFields
              .filter((field) => field.visible !== false && field.value.trim())
              .map((field) => field.value)
              .join(' · ')}
          </p>
        )}
      </header>

      {sections.map((section) => (
        <RenderedSection key={section.id} section={section} dateFormat={resume.styles.dateFormat} />
      ))}
    </article>
  );
}

function RenderedSection({
  section,
  dateFormat,
}: {
  section: Section;
  dateFormat: Resume['styles']['dateFormat'];
}) {
  return (
    <section className="space-y-2">
      <h4 className="border-b border-paper-edge pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        {section.title}
      </h4>
      <div className="space-y-2.5">
        {section.entries.map((entry) => {
          const dates = formatDateRange(
            entry.startDate,
            entry.endDate,
            entry.current,
            dateFormat,
          );
          return (
            <div key={entry.id} className="space-y-1">
              {(entry.title || entry.subtitle || dates) && (
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <div className="min-w-0 font-medium text-ink">
                    {entry.title}
                    {entry.title && entry.subtitle ? ' — ' : ''}
                    {entry.subtitle && (
                      <span className="font-normal text-ink-muted">{entry.subtitle}</span>
                    )}
                  </div>
                  {dates && <div className="shrink-0 text-[11px] text-ink-subtle">{dates}</div>}
                </div>
              )}
              {entry.location && (
                <div className="text-[11px] text-ink-subtle">{entry.location}</div>
              )}
              {(entry.bullets ?? []).filter((bullet) => bullet.visible !== false).length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-ink-muted">
                  {(entry.bullets ?? [])
                    .filter((bullet) => bullet.visible !== false)
                    .sort((a, b) => a.order - b.order)
                    .map((bullet) => (
                      <li key={bullet.id}>{bullet.content}</li>
                    ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
