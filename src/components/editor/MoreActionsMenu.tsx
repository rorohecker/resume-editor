import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  GitCompare,
  Layers,
  Library,
  ListChecks,
  MoreHorizontal,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '@/store';

// Secondary editor actions. Visible as icon buttons on wide screens; collapsed
// into this overflow menu when there's not enough horizontal room in the top
// nav. Avoids cramped icon strips on 13" laptops.

export function MoreActionsMenu() {
  const { t } = useTranslation();
  const setTailorOpen = useStore((s) => s.setTailorOpen);
  const setCompareOpen = useStore((s) => s.setCompareOpen);
  const setBulkEditOpen = useStore((s) => s.setBulkEditOpen);
  const setLibraryOpen = useStore((s) => s.setLibraryOpen);
  const setVariantOpen = useStore((s) => s.setVariantOpen);
  const pdfPreviewMode = useStore((s) => s.pdfPreviewMode);
  const setPdfPreviewMode = useStore((s) => s.setPdfPreviewMode);
  const anonymized = useStore((s) => s.anonymized);
  const setAnonymized = useStore((s) => s.setAnonymized);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const items: { label: string; icon: LucideIcon; onClick: () => void; active?: boolean }[] = [
    {
      label: t('library.title'),
      icon: Library,
      onClick: () => {
        setOpen(false);
        setLibraryOpen(true);
      },
    },
    {
      label: t('variant.title'),
      icon: Layers,
      onClick: () => {
        setOpen(false);
        setVariantOpen(true);
      },
    },
    {
      label: t('editor.tailorToJob'),
      icon: Wand2,
      onClick: () => {
        setOpen(false);
        setTailorOpen(true);
      },
    },
    {
      label: t('editor.compare'),
      icon: GitCompare,
      onClick: () => {
        setOpen(false);
        setCompareOpen(true);
      },
    },
    {
      label: t('editor.bulkEdit'),
      icon: ListChecks,
      onClick: () => {
        setOpen(false);
        setBulkEditOpen(true);
      },
    },
    {
      label: pdfPreviewMode ? t('editor.pdfPreviewOn') : t('editor.pdfPreviewOff'),
      icon: FileText,
      active: pdfPreviewMode,
      onClick: () => setPdfPreviewMode(!pdfPreviewMode),
    },
    {
      label: anonymized ? t('editor.anonymizeOn') : t('editor.anonymizeOff'),
      icon: anonymized ? EyeOff : Eye,
      active: anonymized,
      onClick: () => setAnonymized(!anonymized),
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`icon-btn ${open ? 'bg-paper-tint text-ink' : ''}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('editor.moreActions')}
        title={t('editor.moreActions')}
      >
        <MoreHorizontal size={16} />
        <ChevronDown size={10} className="-ml-1" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-md border border-paper-edge bg-paper shadow-page"
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={item.onClick}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-paper-tint ${
                item.active ? 'bg-paper-tint text-ink' : 'text-ink-muted'
              }`}
            >
              <item.icon size={14} />
              <span className="flex-1">{item.label}</span>
              {item.active && <span className="text-[10px] text-accent">●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
