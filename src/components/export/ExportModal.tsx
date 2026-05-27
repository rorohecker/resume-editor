import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Braces,
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
  type ExportArtifact,
  type ExportFormat,
} from '@/utils/exportFiles';
import { Modal } from '@/components/shared/Modal';
import { toast } from '@/hooks/useToast';

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
  // Object URL for binary formats (pdf / png / docx) and text body for text formats.
  url: string | null;
  text: string | null;
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
  const [preview, setPreview] = useState<Preview | null>(null);
  // Tracks every object URL we've created so we can revoke on unmount / close.
  const urlsRef = useRef<string[]>([]);

  // Cleanup all blob URLs whenever the modal closes or the preview switches.
  useEffect(() => {
    if (!open) {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current = [];
      setPreview(null);
      setBusy(null);
    }
  }, [open]);

  useEffect(() => () => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
  }, []);

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
      if (format === 'txt' || format === 'json') {
        text = await artifact.blob.text();
      } else {
        url = URL.createObjectURL(artifact.blob);
        urlsRef.current.push(url);
      }
      setPreview({ format, artifact, url, text });
    } catch (err) {
      toast(err instanceof Error ? err.message : t('exportModal.failed'), {
        tone: 'danger',
        ttl: 5000,
      });
    } finally {
      setBusy(null);
    }
  };

  const confirmDownload = () => {
    if (!preview) return;
    downloadArtifact(preview.artifact);
    toast(t('exportModal.downloaded', { format: preview.format.toUpperCase() }), {
      tone: 'success',
    });
    close();
  };

  const backToChooser = () => {
    setPreview(null);
  };

  const headerActions = useMemo(() => {
    if (preview) {
      return (
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={backToChooser} className="btn-ghost text-xs">
            <ArrowLeft size={12} />
            Choose another format
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={close} className="btn-secondary text-xs">
              {t('exportModal.cancel')}
            </button>
            <button type="button" onClick={confirmDownload} className="btn-primary text-xs">
              Confirm and download
            </button>
          </div>
        </div>
      );
    }
    return (
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
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  return (
    <Modal
      open={open}
      onClose={close}
      title={preview ? `Preview: ${preview.artifact.filename}` : t('exportModal.title')}
      maxWidth="xl"
      footer={headerActions}
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
  const { format, artifact, url, text } = preview;
  const sizeLabel = formatBytes(artifact.blob.size);

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          <strong className="text-ink">{artifact.filename}</strong> · {format.toUpperCase()} · {sizeLabel}
        </span>
        <span className="text-ink-subtle">Nothing is downloaded until you click Confirm.</span>
      </div>
      <div className="overflow-hidden rounded-md border border-paper-edge bg-paper-tint">
        {format === 'pdf' && url && (
          <iframe
            title="PDF preview"
            src={`${url}#toolbar=0&navpanes=0`}
            className="h-[60vh] w-full bg-white"
          />
        )}
        {format === 'png' && url && (
          <div className="max-h-[60vh] overflow-auto bg-white p-4">
            <img src={url} alt="PNG preview" className="mx-auto block" />
          </div>
        )}
        {format === 'docx' && (
          <div className="space-y-3 p-4 text-sm text-ink-muted">
            <p>
              Word documents can't preview natively in the browser, but here's exactly what will save:
            </p>
            <ul className="ml-4 list-disc space-y-1 text-xs">
              <li><strong>{artifact.filename}</strong></li>
              <li>{sizeLabel}</li>
              <li>Margins, fonts, and bullet numbering match the resume's appearance settings.</li>
              <li>Dates are tab-aligned to the right edge.</li>
            </ul>
            <p className="text-xs text-ink-subtle">
              Tip: open the same resume's PDF preview from this menu to verify the layout — Word will
              match it within the constraints of the .docx format.
            </p>
          </div>
        )}
        {(format === 'txt' || format === 'json') && text !== null && (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap bg-white p-4 text-[11px] leading-snug text-ink">
            {text}
          </pre>
        )}
      </div>
    </div>
  );
}
