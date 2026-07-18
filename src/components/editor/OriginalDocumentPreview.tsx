import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileWarning, Loader2 } from 'lucide-react';
import {
  isPreviewableOriginal,
  originalToBlob,
  type ImportOriginalFile,
} from '@/utils/importReference';
import { renderPdfBlobToImages } from '@/utils/exportFiles';

export function OriginalDocumentPreview({ original }: { original: ImportOriginalFile }) {
  const { t } = useTranslation();
  const [pdfImages, setPdfImages] = useState<string[] | null>(null);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const kind = detectKind(original);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPdfImages(null);
    setPdfTotalPages(0);
    setDocxHtml(null);

    if (!isPreviewableOriginal(original) || kind === 'unknown') {
      setLoading(false);
      setError(t('importReference.originalUnsupported'));
      return;
    }

    void (async () => {
      try {
        const blob = originalToBlob(original);
        if (kind === 'pdf') {
          const rendered = await renderPdfBlobToImages(blob, { scale: 1.15, maxPages: 8 });
          if (cancelled) return;
          setPdfImages(rendered.images);
          setPdfTotalPages(rendered.totalPages);
        } else {
          const mammoth = await import('mammoth');
          const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
          if (cancelled) return;
          setDocxHtml(result.value || '<p></p>');
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('importReference.originalFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [original, kind, t]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm text-ink-subtle">
        <Loader2 size={18} className="animate-spin" />
        {t('importReference.originalLoading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-3 flex items-start gap-2 rounded-md border border-paper-edge bg-paper-tint p-3 text-xs text-danger">
        <FileWarning size={14} className="mt-0.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (kind === 'pdf' && pdfImages) {
    return (
      <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-paper-tint p-3">
        {pdfTotalPages > pdfImages.length && (
          <p className="text-center text-[11px] text-ink-subtle">
            {t('importReference.originalTruncated', {
              shown: pdfImages.length,
              total: pdfTotalPages,
            })}
          </p>
        )}
        {pdfImages.map((src, index) => (
          <img
            key={`${index}-${src.slice(0, 24)}`}
            src={src}
            alt={t('importReference.originalPage', { page: index + 1 })}
            className="mx-auto w-full max-w-full border border-paper-edge bg-white shadow-sm"
            draggable={false}
          />
        ))}
      </div>
    );
  }

  if (kind === 'docx' && docxHtml) {
    return (
      <div className="min-h-0 flex-1 overflow-auto bg-white p-4 text-[12px] leading-snug text-black">
        <div
          className="import-docx-preview prose prose-sm max-w-none [&_p]:mb-2 [&_table]:w-full [&_td]:border [&_td]:border-gray-200 [&_td]:p-1 [&_ul]:list-disc [&_ul]:pl-5"
          // Mammoth HTML is generated from the user's own uploaded DOCX.
          dangerouslySetInnerHTML={{ __html: docxHtml }}
        />
      </div>
    );
  }

  return null;
}

function detectKind(original: ImportOriginalFile): 'pdf' | 'docx' | 'unknown' {
  const mime = original.mime.toLowerCase();
  const name = (original.name ?? '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('wordprocessingml') || name.endsWith('.docx')) return 'docx';
  return 'unknown';
}
