import { useTranslation } from 'react-i18next';
import { useStore } from '@/store';
import { Modal } from '@/components/shared/Modal';

// Detect platform once for display (⌘ vs Ctrl). Purely cosmetic.
const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
const mod = isMac ? '⌘' : 'Ctrl';

interface Shortcut {
  keys: string[];
  label: string;
  defaultLabel: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: [mod, 'S'], label: 'shortcuts.save', defaultLabel: 'Save now' },
  { keys: [mod, 'Z'], label: 'shortcuts.undo', defaultLabel: 'Undo' },
  { keys: [mod, '⇧', 'Z'], label: 'shortcuts.redo', defaultLabel: 'Redo' },
  { keys: [mod, 'E'], label: 'shortcuts.export', defaultLabel: 'Open export' },
  { keys: [mod, 'P'], label: 'shortcuts.print', defaultLabel: 'Print / Save as PDF' },
  { keys: ['?'], label: 'shortcuts.help', defaultLabel: 'Show this shortcuts list' },
  { keys: ['Alt', 'Click'], label: 'shortcuts.hideBullet', defaultLabel: 'Hide a bullet (click it in the preview)' },
];

export function ShortcutsModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.shortcutsOpen);
  const setOpen = useStore((s) => s.setShortcutsOpen);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t('shortcuts.title', { defaultValue: 'Keyboard shortcuts' })}
      maxWidth="md"
    >
      <div className="divide-y divide-paper-edge p-5">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.label} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-sm text-ink-muted">
              {t(shortcut.label, { defaultValue: shortcut.defaultLabel })}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {shortcut.keys.map((key, i) => (
                <kbd
                  key={i}
                  className="rounded border border-paper-edge bg-paper-tint px-2 py-0.5 text-xs font-medium text-ink shadow-sm"
                >
                  {key}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
