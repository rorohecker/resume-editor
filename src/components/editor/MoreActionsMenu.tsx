import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bookmark,
  ChevronDown,
  ClipboardCopy,
  Eye,
  EyeOff,
  FileText,
  GitCompare,
  HardDriveDownload,
  Keyboard,
  Layers,
  Library,
  ListChecks,
  BookOpen,
  MoreHorizontal,
  PanelLeftOpen,
  Printer,
  Share2,
  StickyNote,
  Upload,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '@/store';
import { toast } from '@/hooks/useToast';
import { resumeToPlainText } from '@/utils/resumeText';
import { tooltipProps } from '@/components/shared/tooltipProps';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { AccentToggle } from '@/components/shared/AccentToggle';
import { exportAllData, importAllData, isFullAppBackup } from '@/store/persistence';
import { recordBackup } from '@/utils/updateCheck';

type MenuItem = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  /** Tailwind responsive class: hide this row when the same action is in the top bar. */
  navClass?: string;
};

// Secondary editor actions. Visible as icon buttons on wide screens; collapsed
// into this overflow menu when there's not enough horizontal room in the top nav.

export function MoreActionsMenu({
  onImport,
  onSaveSnapshot,
}: {
  onImport?: () => void;
  onSaveSnapshot?: () => void;
}) {
  const { t } = useTranslation();
  const setTailorOpen = useStore((s) => s.setTailorOpen);
  const setCompareOpen = useStore((s) => s.setCompareOpen);
  const setBulkEditOpen = useStore((s) => s.setBulkEditOpen);
  const setLibraryOpen = useStore((s) => s.setLibraryOpen);
  const setVariantOpen = useStore((s) => s.setVariantOpen);
  const setShareOpen = useStore((s) => s.setShareOpen);
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen);
  const setTutorialOpen = useStore((s) => s.setTutorialOpen);
  const stickyNotesOpen = useStore((s) => s.stickyNotesOpen);
  const setStickyNotesOpen = useStore((s) => s.setStickyNotesOpen);
  const importReferenceOpen = useStore((s) => s.importReferenceOpen);
  const importReferenceAvailable = useStore((s) => s.importReferenceAvailable);
  const setImportReferenceOpen = useStore((s) => s.setImportReferenceOpen);
  const pdfPreviewMode = useStore((s) => s.pdfPreviewMode);
  const setPdfPreviewMode = useStore((s) => s.setPdfPreviewMode);
  const anonymized = useStore((s) => s.anonymized);
  const setAnonymized = useStore((s) => s.setAnonymized);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const printResume = () => {
    setOpen(false);
    if (pdfPreviewMode) setPdfPreviewMode(false);
    window.setTimeout(() => window.print(), 200);
  };

  const copyPlainText = async () => {
    setOpen(false);
    const resume = useStore.getState().currentResume;
    if (!resume) return;
    try {
      await navigator.clipboard.writeText(resumeToPlainText(resume));
      toast(t('editor.copiedPlainText', { defaultValue: 'Resume copied as plain text' }), {
        tone: 'success',
        ttl: 1800,
      });
    } catch {
      toast(t('editor.copyFailed', { defaultValue: 'Could not copy to clipboard' }), {
        tone: 'danger',
      });
    }
  };

  const exportBackup = () => {
    setOpen(false);
    void exportAllData().then((data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `resume-editor-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      recordBackup();
      toast(t('editor.backupSaved', { defaultValue: 'Backup downloaded' }), { tone: 'success', ttl: 1800 });
    });
  };

  const restoreBackup = async (file: File) => {
    setOpen(false);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isFullAppBackup(parsed)) {
        toast(t('landing.restoreInvalid'), { tone: 'warn' });
        return;
      }
      const result = await importAllData(parsed);
      toast(t('landing.restoreDone', { count: result.resumes }), { tone: 'success' });
    } catch (err) {
      toast(err instanceof Error ? err.message : t('landing.restoreFailed'), { tone: 'danger' });
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const items: MenuItem[] = [
    ...(onImport
      ? [{
          label: t('editor.importMerge'),
          icon: Upload,
          navClass: 'sm:hidden',
          onClick: () => {
            setOpen(false);
            onImport();
          },
        }]
      : []),
    ...(onSaveSnapshot
      ? [{
          label: t('editor.saveSnapshot'),
          icon: Bookmark,
          navClass: 'md:hidden',
          onClick: () => {
            setOpen(false);
            onSaveSnapshot();
          },
        }]
      : []),
    {
      label: t('editor.backupNow'),
      icon: HardDriveDownload,
      navClass: 'lg:hidden',
      onClick: exportBackup,
    },
    {
      label: t('landing.restoreBackup'),
      icon: Upload,
      navClass: 'lg:hidden',
      onClick: () => backupInputRef.current?.click(),
    },
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
    ...(importReferenceAvailable
      ? [{
          label: importReferenceOpen
            ? t('importReference.hide')
            : t('importReference.toggle'),
          icon: PanelLeftOpen,
          active: importReferenceOpen,
          onClick: () => {
            setOpen(false);
            setImportReferenceOpen(!importReferenceOpen);
          },
        }]
      : []),
    {
      label: t('editor.bulkEdit'),
      icon: ListChecks,
      onClick: () => {
        setOpen(false);
        setBulkEditOpen(true);
      },
    },
    {
      label: t('editor.shareLink', { defaultValue: 'Share read-only link' }),
      icon: Share2,
      onClick: () => {
        setOpen(false);
        setShareOpen(true);
      },
    },
    {
      label: t('editor.print', { defaultValue: 'Print resume' }),
      icon: Printer,
      onClick: printResume,
    },
    {
      label: t('editor.copyPlainText', { defaultValue: 'Copy as plain text' }),
      icon: ClipboardCopy,
      onClick: () => void copyPlainText(),
    },
    {
      label: t('stickyNotes.toggle', { defaultValue: 'Sticky notes' }),
      icon: StickyNote,
      active: stickyNotesOpen,
      onClick: () => {
        setOpen(false);
        setStickyNotesOpen(!stickyNotesOpen);
      },
    },
    {
      label: t('tutorial.open'),
      icon: BookOpen,
      onClick: () => {
        setOpen(false);
        setTutorialOpen(true);
      },
    },
    {
      label: t('shortcuts.title', { defaultValue: 'Keyboard shortcuts' }),
      icon: Keyboard,
      onClick: () => {
        setOpen(false);
        setShortcutsOpen(true);
      },
    },
    {
      label: pdfPreviewMode ? t('editor.pdfPreviewOn') : t('editor.pdfPreviewOff'),
      icon: FileText,
      active: pdfPreviewMode,
      onClick: () => {
        setOpen(false);
        setPdfPreviewMode(!pdfPreviewMode);
      },
    },
    {
      label: anonymized ? t('editor.anonymizeOn') : t('editor.anonymizeOff'),
      icon: anonymized ? EyeOff : Eye,
      active: anonymized,
      onClick: () => {
        setOpen(false);
        setAnonymized(!anonymized);
      },
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
        {...tooltipProps(t('editor.moreActions'), 'end', 'top')}
      >
        <MoreHorizontal size={16} />
        <ChevronDown size={10} className="-ml-1" />
      </button>
      <input
        ref={backupInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void restoreBackup(file);
        }}
      />
      {open && (
        <div
          className="absolute right-0 z-[200] mt-1 w-[min(14rem,calc(100vw-1rem))] overflow-hidden rounded-md border border-paper-edge bg-paper shadow-page"
          role="menu"
        >
          <div className="max-h-[min(70vh,24rem)] overflow-y-auto overscroll-contain">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={item.onClick}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs active:bg-paper-tint ${
                  item.navClass ?? ''
                } ${item.active ? 'bg-paper-tint text-ink' : 'text-ink-muted hover:bg-paper-tint'}`}
              >
                <item.icon size={14} />
                <span className="flex-1">{item.label}</span>
                {item.active && <span className="text-[10px] text-accent">●</span>}
              </button>
            ))}
          </div>
          <div className="border-t border-paper-edge px-3 py-2 md:hidden">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
              {t('editor.themeAndAccent', { defaultValue: 'Theme & accent' })}
            </p>
            <div className="flex flex-col gap-2">
              <AccentToggle compact />
              <ThemeToggle compact />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
