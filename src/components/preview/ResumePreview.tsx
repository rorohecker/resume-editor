import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store';
import { ZoomControls } from './ZoomControls';
import { PreviewRenderer } from './PreviewRenderer';
import { PdfPreview } from './PdfPreview';
import { anonymizeResume } from '@/utils/anonymize';
import { toast } from '@/hooks/useToast';

const PAPER_DIMENSIONS = {
  letter: { width: 8.5 * 96, height: 11 * 96 },
  a4: { width: 8.27 * 96, height: 11.69 * 96 },
};

export function ResumePreview() {
  const { t } = useTranslation();
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const resume = useStore((s) => s.currentResume);
  const updateResume = useStore((s) => s.updateCurrentResume);
  const pdfPreviewMode = useStore((s) => s.pdfPreviewMode);
  const anonymized = useStore((s) => s.anonymized);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const page = PAPER_DIMENSIONS[resume?.styles.paperSize ?? 'letter'];

  // Alt-click on a bullet in the preview hides it (sends to library). Click
  // anywhere else does nothing — Alt is required so it's not too easy to
  // accidentally hide content.
  const handlePreviewClick = useCallback(
    (event: React.MouseEvent) => {
      if (!event.altKey) return;
      const target = event.target as HTMLElement;
      const bulletEl = target.closest<HTMLElement>('[data-preview-bullet]');
      if (!bulletEl) return;
      const bulletId = bulletEl.dataset.previewBullet;
      if (!bulletId) return;
      event.preventDefault();
      updateResume((current) => ({
        ...current,
        sections: current.sections.map((section) => ({
          ...section,
          entries: section.entries.map((entry) => ({
            ...entry,
            bullets: entry.bullets?.map((bullet) =>
              bullet.id === bulletId ? { ...bullet, visible: false } : bullet,
            ),
          })),
        })),
      }));
      toast(t('preview.bulletHidden'), { tone: 'info', ttl: 1800 });
    },
    [updateResume, t],
  );

  const displayResume = useMemo(
    () => (resume && anonymized ? anonymizeResume(resume) : resume),
    [resume, anonymized],
  );

  const fitToWidth = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const available = el.clientWidth - 64;
    const next = Math.max(0.5, Math.min(1.5, available / page.width));
    setZoom(next);
  }, [page.width, setZoom]);

  useLayoutEffect(() => {
    fitToWidth();
  }, [fitToWidth]);

  // Pinch-to-zoom on touch devices. We track the initial distance between two
  // touches and scale zoom proportionally. Native browser pinch-zoom is
  // disabled inside the scroller via touch-action so we don't fight it.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let startDistance = 0;
    let startZoom = zoom;
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      startDistance = pinchDistance(event);
      startZoom = useStore.getState().zoom;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || startDistance === 0) return;
      event.preventDefault();
      const ratio = pinchDistance(event) / startDistance;
      setZoom(Math.min(1.5, Math.max(0.5, startZoom * ratio)));
    };
    const onTouchEnd = () => {
      startDistance = 0;
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [setZoom, zoom]);

  // PDF preview path: a real <PDFViewer> renders the same document the export
  // would produce. Slower (5–10 MB first load) but pixel-perfect.
  if (pdfPreviewMode && displayResume) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden bg-paper-tint">
        <div className="flex-1">
          <PdfPreview resume={displayResume} />
        </div>
        {anonymized && <AnonymizeBadge label={t('preview.anonymizeBadge')} />}
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-paper-tint">
      <div
        ref={scrollerRef}
        className="flex-1 overflow-auto p-8 touch-pan-x touch-pan-y"
        onClick={handlePreviewClick}
      >
        <div className="mx-auto flex justify-center">
          <div
            className="resume-print-page origin-top bg-paper shadow-page"
            style={{
              width: page.width,
              minHeight: page.height,
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              marginBottom: Math.max(0, page.height * (zoom - 1)),
            }}
          >
            {displayResume ? <PreviewRenderer resume={displayResume} /> : <PreviewPlaceholder />}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 flex items-end justify-end">
        <div className="pointer-events-auto">
          <ZoomControls onFitToWidth={fitToWidth} />
        </div>
      </div>

      {anonymized && <AnonymizeBadge label={t('preview.anonymizeBadge')} />}
    </div>
  );
}

function PreviewPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-32 text-center text-ink-subtle">
      <p className="text-sm">{t('preview.yourPreview')}</p>
    </div>
  );
}

function AnonymizeBadge({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-warn/90 px-3 py-1 text-xs font-semibold text-paper shadow">
      {label}
    </div>
  );
}

function pinchDistance(event: TouchEvent): number {
  const [a, b] = [event.touches[0], event.touches[1]];
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}
