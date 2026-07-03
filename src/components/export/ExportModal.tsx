import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Braces,
  Download,
  FileCode2,
  FileText,
  FileType,
  ImageIcon,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '@/store';
import {
  downloadArtifact,
  generateExportArtifact,
  renderPdfBlob,
  renderPdfBlobToImages,
  renderResumePreviewDataUrl,
  type ExportArtifact,
  type ExportFormat,
} from '@/utils/exportFiles';
import { Modal } from '@/components/shared/Modal';
import { toast } from '@/hooks/useToast';

// Export modal flow:
//   1. ChooserPane — user picks a format. We generate the artifact in memory.
//   2. PreviewPane — user sees the actual file content (pdf / png / text /
//      json) or a summary (docx). Confirm and download triggers the actual
//      save; Back returns to the chooser.
//
// State is kept simple: no useMemo, no derived state. The artifact blob lives
// in component state and we hand it to downloadArtifact() on confirm.

const FORMAT_IDS: { id: ExportFormat; icon: LucideIcon }[] = [
  { id: 'pdf', icon: FileText },
  { id: 'docx', icon: FileType },
  { id: 'txt', icon: FileCode2 },
  { id: 'png', icon: ImageIcon },
  { id: 'json', icon: Braces },
];

interface Preview {
  format: ExportFormat;
  artifact: ExportArtifact;
  url: string | null; // For binary previews (png) and the pdf iframe fallback.
  text: string | null; // For text previews (txt / json).
  images: string[] | null; // Rendered page images (pdf via pdfjs, docx approximation).
  approximate: boolean; // True when the image is a layout approximation (docx).
  totalPages: number | null; // Total pages in the source PDF, when known.
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function ExportModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.exportOpen);
  const setOpen = useStore((s) => s.setExportOpen);
  const resume = useStore((s) => s.currentResume);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const urlsRef = useRef<string[]>([]);

  const clearUrls = () => {
    for (const url of urlsRef.current) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    urlsRef.current = [];
  };

  useEffect(() => {
    if (!open) {
      clearUrls();
      setPreview(null);
      setBusy(null);
      setDownloading(false);
    }
  }, [open]);

  useEffect(() => () => clearUrls(), []);

  const close = () => {
    setOpen(false);
  };

  const startPreview = async (format: ExportFormat) => {
    if (!resume) return;
    setBusy(format);
    try {
      const artifact = await generateExportArtifact(resume, format);
      let url: string | null = null;
      let text: string | null = null;
      let images: string[] | null = null;
      let approximate = false;
      let totalPages: number | null = null;

      if (format === 'txt' || format === 'json') {
        text = await artifact.blob.text();
      } else if (format === 'png') {
        url = URL.createObjectURL(artifact.blob);
        urlsRef.current.push(url);
        try {
          const pdfBlob = await renderPdfBlob(resume);
          const rendered = await renderPdfBlobToImages(pdfBlob, { maxPages: 10 });
          images = rendered.images.length > 0 ? rendered.images : [url];
          totalPages = rendered.totalPages;
        } catch (renderErr) {
          console.warn('[ExportModal] PNG page preview failed, using single image:', renderErr);
          images = [url];
        }
      } else if (format === 'pdf') {
        // Render the PDF to page images so the preview works under file://,
        // where browsers refuse to render blob-URL PDFs inside an iframe.
        // Keep a blob URL as a graceful fallback if pdfjs can't render.
        url = URL.createObjectURL(artifact.blob);
        urlsRef.current.push(url);
        try {
          const rendered = await renderPdfBlobToImages(artifact.blob, { maxPages: 10 });
          images = rendered.images.length > 0 ? rendered.images : null;
          totalPages = rendered.totalPages;
        } catch (renderErr) {
          console.warn('[ExportModal] PDF image preview failed, using iframe fallback:', renderErr);
          images = null;
        }
      } else if (format === 'docx') {
        // Word can't render in-browser; show a faithful image of the resume's
        // on-screen layout as a visual approximation instead of a blank box.
        try {
          images = [await renderResumePreviewDataUrl(resume)];
          approximate = true;
        } catch (renderErr) {
          console.warn('[ExportModal] DOCX preview image failed:', renderErr);
          images = null;
        }
      }

      setPreview({ format, artifact, url, text, images, approximate, totalPages });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not generate the export.';
      console.error('[ExportModal] generate failed:', err);
      toast(`Preview failed: ${message}`, { tone: 'danger', ttl: 6000 });
    } finally {
      setBusy(null);
    }
  };

  const confirmDownload = () => {
    if (!preview) return;
    setDownloading(true);
    try {
      downloadArtifact(preview.artifact);
      toast(`Downloading ${preview.artifact.filename}`, { tone: 'success', ttl: 2500 });
      // Don't auto-close — let the user see the success state and dismiss
      // themselves. Auto-closing also raced the download in some browsers
      // because the modal unmount cleared the urls ref synchronously.
      window.setTimeout(() => {
        setDownloading(false);
        close();
      }, 800);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed.';
      console.error('[ExportModal] download failed:', err);
      toast(message, { tone: 'danger', ttl: 6000 });
      setDownloading(false);
    }
  };

  const backToChooser = () => {
    clearUrls();
    setPreview(null);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={preview ? `Preview: ${preview.artifact.filename}` : t('exportModal.title')}
      maxWidth="xl"
      footer={
        preview ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={backToChooser}
              disabled={downloading}
              className="btn-ghost text-xs"
            >
              <ArrowLeft size={12} />
              Choose another format
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                disabled={downloading}
                className="btn-secondary text-xs"
              >
                {t('exportModal.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDownload}
                disabled={downloading}
                className="btn-primary text-xs"
              >
                <Download size={12} />
                {downloading ? 'Downloading…' : 'Confirm and download'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-ghost text-xs"
            >
              {t('exportModal.printPreview')}
            </button>
            <button type="button" onClick={close} className="btn-secondary">
              {t('exportModal.cancel')}
            </button>
          </div>
        )
      }
    >
      {preview ? (
        <PreviewPane preview={preview} />
      ) : (
        <ChooserPane
          busy={busy}
          disabled={!resume}
          onPick={(format) => void startPreview(format)}
          resumeName={resume?.name}
        />
      )}
    </Modal>
  );
}

function ChooserPane({
  busy,
  disabled,
  onPick,
  resumeName,
}: {
  busy: ExportFormat | null;
  disabled: boolean;
  onPick: (format: ExportFormat) => void;
  resumeName?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-5 py-4">
      <p className="mb-4 text-sm text-ink-muted">
        {resumeName
          ? t('exportModal.chooseFormat', { name: resumeName })
          : t('exportModal.chooseFormatGeneric')}
        <span className="ml-2 inline-block rounded bg-paper-tint px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-subtle">
          Preview before download
        </span>
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FORMAT_IDS.map((format) => (
          <button
            key={format.id}
            type="button"
            disabled={disabled || busy !== null}
            onClick={() => onPick(format.id)}
            className="flex items-start gap-3 rounded-md border border-paper-edge bg-paper p-3 text-left transition-colors hover:bg-paper-tint disabled:opacity-60"
          >
            <format.icon size={18} className="mt-0.5 text-ink-muted" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">
                {busy === format.id ? 'Generating preview…' : t(`exportModal.${format.id}`)}
              </div>
              <div className="text-xs text-ink-subtle">
                {t(`exportModal.${format.id}Note`)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewPane({ preview }: { preview: Preview }) {
  const { format, artifact, url, text, images, approximate, totalPages } = preview;
  const sizeLabel = formatBytes(artifact.blob.size);
  const truncated =
    format === 'pdf' && images != null && totalPages != null && totalPages > images.length;

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          <strong className="text-ink">{artifact.filename}</strong> · {format.toUpperCase()} · {sizeLabel}
        </span>
        <span className="text-ink-subtle">Nothing saves until you click Confirm.</span>
      </div>
      {format === 'docx' && approximate && (
        <p className="rounded-md bg-paper-tint px-3 py-2 text-xs text-ink-subtle">
          Visual approximation of the Word document. Margins, fonts, bullets, and right-aligned dates
          carry over; Word may reflow line breaks slightly.
        </p>
      )}
      {truncated && images && (
        <p className="rounded-md bg-paper-tint px-3 py-2 text-xs text-ink-subtle">
          Showing the first {images.length} of {totalPages} pages. The downloaded file includes all pages.
        </p>
      )}
      <div className="overflow-hidden rounded-md border border-paper-edge bg-paper-tint">
        {/* Image-based previews (pdf via pdfjs, docx approximation). Data-URL
            images render everywhere, including file://, unlike blob iframes. */}
        {images && images.length > 0 ? (
          <div className="max-h-[60vh] space-y-3 overflow-auto bg-paper-tint p-4">
            {images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`${format.toUpperCase()} preview page ${i + 1}`}
                className="mx-auto block max-w-full shadow-sm ring-1 ring-paper-edge"
              />
            ))}
          </div>
        ) : format === 'pdf' && url ? (
          // Fallback when pdfjs can't rasterize: try the native viewer.
          <iframe title="PDF preview" src={url} className="h-[60vh] w-full bg-white" />
        ) : format === 'png' && url ? (
          <div className="max-h-[60vh] overflow-auto bg-white p-4">
            <img src={url} alt="PNG preview" className="mx-auto block" />
          </div>
        ) : (format === 'txt' || format === 'json') && text !== null ? (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap bg-paper p-4 text-[11px] leading-snug text-ink">
            {text}
          </pre>
        ) : (
          <div className="p-4 text-sm text-ink-muted">
            Preview unavailable, but <strong className="text-ink">{artifact.filename}</strong> ({sizeLabel}) is
            ready to download.
          </div>
        )}
      </div>
    </div>
  );
}
