import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Resume } from '@/types';

const PDFViewerLazy = lazy(async () => {
  const mod = await import('@react-pdf/renderer');
  const fontsModule = await import('@/utils/pdfFonts');
  // Pre-register the chosen font before the first render so the viewer doesn't
  // flash with a fallback face.
  // Done lazily per-resume by the caller via ensureFontRegistered.
  return {
    default: ({ resume, document }: { resume: Resume; document: React.ReactElement }) => {
      void resume;
      const Viewer = mod.PDFViewer;
      return (
        <Viewer style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#fff' }}>
          {document}
        </Viewer>
      );
    },
    fontsModule,
  };
});

export function PdfPreview({ resume }: { resume: Resume }) {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<React.ReactElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const resumeKey = useMemo(() => JSON.stringify(resume), [resume]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ createPdfDocumentFor }, { ensureFontRegistered }, pdfMod] = await Promise.all([
          import('@/utils/pdfDocument'),
          import('@/utils/pdfFonts'),
          import('@react-pdf/renderer'),
        ]);
        await ensureFontRegistered(resume.styles.font, pdfMod);
        const document = createPdfDocumentFor(resume, pdfMod);
        if (!cancelled) setDoc(document as React.ReactElement);
      } catch (error) {
        if (!cancelled) setErr(error instanceof Error ? error.message : t('preview.pdfFailed'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeKey, resume]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-danger">
        {err}
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-ink-subtle">
        {t('preview.renderingPdf')}
      </div>
    );
  }
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center p-4 text-sm text-ink-subtle">
          {t('preview.loadingViewer')}
        </div>
      }
    >
      <PDFViewerLazy resume={resume} document={doc} />
    </Suspense>
  );
}
