import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Resume } from '@/types';
import { renderPdfBlob, renderPdfBlobToImages } from '@/utils/exportFiles';

export function PdfPreview({ resume }: { resume: Resume }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [images, setImages] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const resumeKey = `${resume.id}:${resume.updatedAt}:${resume.styles.font}`;

  useEffect(() => {
    let cancelled = false;
    let nextUrl: string | null = null;
    (async () => {
      setErr(null);
      setUrl(null);
      setImages(null);
      try {
        const blob = await renderPdfBlob(resume);
        nextUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(nextUrl);
        // Rasterize to images so the preview also works from file://, where
        // browsers won't render a blob-URL PDF inside an iframe.
        try {
          const rendered = await renderPdfBlobToImages(blob, { scale: 2, maxPages: 10 });
          if (!cancelled && rendered.images.length > 0) setImages(rendered.images);
        } catch {
          // Fall back to the iframe below.
        }
      } catch (error) {
        if (!cancelled) setErr(error instanceof Error ? error.message : t('preview.pdfFailed'));
      }
    })();
    return () => {
      cancelled = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [resumeKey, t]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-danger">
        {err}
      </div>
    );
  }
  if (images && images.length > 0) {
    return (
      <div className="h-full w-full overflow-auto bg-paper-tint p-4">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4">
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`PDF preview page ${i + 1}`}
              className="block w-full shadow-page ring-1 ring-paper-edge"
            />
          ))}
        </div>
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-ink-subtle">
        {t('preview.renderingPdf')}
      </div>
    );
  }
  return (
    <iframe
      title="PDF preview"
      src={`${url}#toolbar=0&navpanes=0`}
      className="h-full w-full border-0 bg-white"
    />
  );
}
