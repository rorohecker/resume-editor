import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, FileType, FileCode2, ImageIcon, Braces, type LucideIcon } from 'lucide-react';
import { useStore } from '@/store';
import type { ExportFormat } from '@/utils/exportFiles';
import { Modal } from '@/components/shared/Modal';
import { toast } from '@/hooks/useToast';

const FORMAT_IDS: { id: ExportFormat; icon: LucideIcon }[] = [
  { id: 'pdf', icon: FileText },
  { id: 'docx', icon: FileType },
  { id: 'txt', icon: FileCode2 },
  { id: 'png', icon: ImageIcon },
  { id: 'json', icon: Braces },
];

export function ExportModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.exportOpen);
  const setOpen = useStore((s) => s.setExportOpen);
  const resume = useStore((s) => s.currentResume);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !resume) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Reuse any cached blob first — the in-editor PDF preview may have
        // already rendered this resume version.
        const [{ tryGetCachedPdf, rememberPdfBlob }] = await Promise.all([
          import('@/utils/pdfBlobCache'),
        ]);
        const hit = tryGetCachedPdf(resume);
        if (hit) {
          if (!cancelled) setPreviewUrl(hit.url);
          return;
        }
        const [{ createPdfDocumentFor }, pdfMod, { ensureFontRegistered }] = await Promise.all([
          import('@/utils/pdfDocument'),
          import('@react-pdf/renderer'),
          import('@/utils/pdfFonts'),
        ]);
        await ensureFontRegistered(resume.styles.font, pdfMod);
        const blob = await pdfMod.pdf(createPdfDocumentFor(resume, pdfMod)).toBlob();
        if (cancelled) return;
        const cached = rememberPdfBlob(resume, blob);
        setPreviewUrl(cached.url);
      } catch {
        // preview is non-essential; silently skip
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, resume]);

  const runExport = async (format: ExportFormat) => {
    if (!resume) return;
    setBusy(format);
    try {
      const { exportResume } = await import('@/utils/exportFiles');
      await exportResume(resume, format);
      toast(t('exportModal.downloaded', { format: format.toUpperCase() }), { tone: 'success' });
      setOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : t('exportModal.failed'), {
        tone: 'danger',
        ttl: 6000,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t('exportModal.title')}
      maxWidth="xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-ghost text-xs"
          >
            {t('exportModal.printPreview')}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
            {t('exportModal.cancel')}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="min-h-[300px] overflow-hidden rounded-md border border-paper-edge bg-paper-tint">
          {previewUrl ? (
            <iframe
              title={t('exportModal.title')}
              src={`${previewUrl}#toolbar=0&navpanes=0`}
              className="h-full min-h-[420px] w-full"
            />
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center text-xs text-ink-subtle">
              {t('exportModal.renderingPreview')}
            </div>
          )}
        </div>
        <div>
          <p className="mb-4 text-sm text-ink-muted">
            {resume?.name
              ? t('exportModal.chooseFormat', { name: resume.name })
              : t('exportModal.chooseFormatGeneric')}
          </p>
          <div className="grid grid-cols-1 gap-2">
            {FORMAT_IDS.map((format) => (
              <button
                key={format.id}
                type="button"
                disabled={!resume || busy !== null}
                onClick={() => void runExport(format.id)}
                className="flex items-start gap-3 rounded-md border border-paper-edge bg-paper p-3 text-left transition-colors hover:bg-paper-tint disabled:opacity-60"
              >
                <format.icon size={18} className="mt-0.5 text-ink-muted" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">
                    {busy === format.id ? t('exportModal.preparing') : t(`exportModal.${format.id}`)}
                  </div>
                  <div className="text-xs text-ink-subtle">
                    {t(`exportModal.${format.id}Note`)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
