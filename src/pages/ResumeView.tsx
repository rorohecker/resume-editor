import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FileWarning } from 'lucide-react';
import type { Resume } from '@/types';
import { decodeResumeFromToken } from '@/utils/shareLink';
import { PreviewRenderer } from '@/components/preview/PreviewRenderer';

const PAPER_DIMENSIONS = {
  letter: { width: 8.5 * 96, height: 11 * 96 },
  a4: { width: 8.27 * 96, height: 11.69 * 96 },
};

// Read-only viewer for a resume shared via #/view?d=<token>. No store, no
// editing — just renders the decoded resume so a recipient can read or print
// it. Nothing is persisted to the viewer's browser.
export function ResumeViewPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [resume, setResume] = useState<Resume | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const token = params.get('d');
    if (!token) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    void decodeResumeFromToken(token).then((decoded) => {
      if (cancelled) return;
      if (decoded) {
        setResume(decoded);
        setStatus('ready');
      } else {
        setStatus('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (status === 'error') {
    return (
      <div className="flex h-full min-h-screen flex-col items-center justify-center gap-3 bg-paper-tint p-8 text-center">
        <FileWarning className="text-ink-subtle" size={32} />
        <h1 className="text-lg font-semibold text-ink">
          {t('view.invalidTitle', { defaultValue: 'This share link is invalid or expired' })}
        </h1>
        <p className="max-w-md text-sm text-ink-muted">
          {t('view.invalidBody', {
            defaultValue:
              'The resume data in this link could not be read. Ask the sender for a fresh link.',
          })}
        </p>
        <Link to="/" className="btn-secondary mt-2 text-sm">
          {t('view.goHome', { defaultValue: 'Open Resume Editor' })}
        </Link>
      </div>
    );
  }

  if (status === 'loading' || !resume) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-paper-tint text-sm text-ink-subtle">
        {t('view.loading', { defaultValue: 'Loading resume…' })}
      </div>
    );
  }

  const page = PAPER_DIMENSIONS[resume.styles.paperSize ?? 'letter'];

  return (
    <div className="min-h-screen bg-paper-tint">
      <header className="flex items-center justify-between gap-3 border-b border-paper-edge bg-paper px-4 py-2 print:hidden">
        <span className="truncate text-sm font-medium text-ink">
          {resume.header.name || resume.name}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => window.print()}
          >
            <Download size={13} /> {t('view.print', { defaultValue: 'Print / Save PDF' })}
          </button>
          <Link to="/" className="btn-ghost text-xs">
            {t('view.madeWith', { defaultValue: 'Made with Resume Editor' })}
          </Link>
        </div>
      </header>
      <div className="flex justify-center overflow-auto p-6">
        <div
          className="resume-print-page bg-paper shadow-page"
          style={{ width: page.width, minHeight: page.height }}
        >
          <PreviewRenderer resume={resume} />
        </div>
      </div>
    </div>
  );
}
