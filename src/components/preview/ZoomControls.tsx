import { Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store';

export function ZoomControls({ onFitToWidth }: { onFitToWidth: () => void }) {
  const { t } = useTranslation();
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);

  return (
    <div className="flex items-center gap-3 rounded-md border border-paper-edge bg-paper px-3 py-1.5 shadow-sm">
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <span className="hidden sm:inline">{t('preview.zoom')}</span>
        <input
          type="range"
          min={50}
          max={150}
          step={5}
          value={Math.round(zoom * 100)}
          onChange={(e) => setZoom(Number(e.target.value) / 100)}
          className="h-1 w-24 cursor-pointer accent-ink"
          aria-label={t('preview.zoom')}
        />
        <span className="w-9 text-right tabular-nums text-ink">{Math.round(zoom * 100)}%</span>
      </label>
      <button
        type="button"
        onClick={onFitToWidth}
        className="icon-btn h-7 w-7"
        title={t('preview.fitToWidth')}
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
