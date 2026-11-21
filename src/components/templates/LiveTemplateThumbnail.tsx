import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateId } from '@/types';
import { getTemplateDemoResume } from '@/components/templates/templateDemos';

const PreviewRenderer = lazy(() =>
  import('@/components/preview/PreviewRenderer').then((module) => ({
    default: module.PreviewRenderer,
  })),
);

/** CSS px per inch used by the preview page width (`8.5in`). */
const PAGE_WIDTH_PX = 8.5 * 96;

/**
 * Scales a full letter-size preview to fill the card width. A fixed
 * `scale(0.24)` left a postage-stamp thumbnail atop a tall empty card.
 */
export function LiveTemplateThumbnail({ templateId }: { templateId: TemplateId }) {
  const demo = useMemo(() => getTemplateDemoResume(templateId), [templateId]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = (width: number) => {
      if (width <= 0) return;
      setScale(width / PAGE_WIDTH_PX);
    };
    update(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      update(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-white">
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{ transform: `scale(${scale})`, width: '8.5in' }}
      >
        <Suspense
          fallback={
            <div className="flex h-[11in] items-center justify-center text-[10px] text-ink-subtle">
              …
            </div>
          }
        >
          <PreviewRenderer resume={demo} showPageBreaks={false} interactive={false} />
        </Suspense>
      </div>
    </div>
  );
}
