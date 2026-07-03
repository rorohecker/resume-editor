import { lazy, Suspense, useMemo } from 'react';
import type { TemplateId } from '@/types';
import { getTemplateDemoResume } from '@/components/templates/templateDemos';

const PreviewRenderer = lazy(() =>
  import('@/components/preview/PreviewRenderer').then((module) => ({
    default: module.PreviewRenderer,
  })),
);

export function LiveTemplateThumbnail({ templateId }: { templateId: TemplateId }) {
  const demo = useMemo(() => getTemplateDemoResume(templateId), [templateId]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <div
        className="pointer-events-none absolute left-1/2 top-0 origin-top"
        style={{ transform: 'translateX(-50%) scale(0.24)', width: '8.5in' }}
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
