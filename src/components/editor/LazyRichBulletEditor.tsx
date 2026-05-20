import { lazy, Suspense } from 'react';

interface Props {
  content: string;
  onChange: (html: string) => void;
  onEnterSplit?: () => void;
  placeholder?: string;
}

// TipTap is ~150 KB gzip; lazy-load it so the initial editor chunk is lighter
// for users who land on an empty resume and haven't started editing bullets.
const RichBulletEditorInner = lazy(() =>
  import('./RichBulletEditor').then((m) => ({ default: m.RichBulletEditor })),
);

export function RichBulletEditor(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="min-h-12 flex-1 rounded-md border border-paper-edge bg-paper px-2 py-1.5 text-xs text-ink-subtle">
          {props.content.replace(/<[^>]*>/g, '') || props.placeholder || '…'}
        </div>
      }
    >
      <RichBulletEditorInner {...props} />
    </Suspense>
  );
}
