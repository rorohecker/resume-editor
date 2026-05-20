import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router-dom';
import { useStore } from '@/store';
import {
  isHydrated,
  loadResume as loadFromStorage,
  onHydrated,
  onRemoteUpdate,
} from '@/store/persistence';
import { toast } from '@/hooks/useToast';
import { useIdleSnapshot } from '@/hooks/useIdleSnapshot';
import { EditorTopNav } from '@/components/editor/EditorTopNav';
import { EditorLeftPanel } from '@/components/editor/EditorLeftPanel';
import { ResumePreview } from '@/components/preview/ResumePreview';
import { AIDrawer } from '@/components/ai/AIDrawer';
import { CoverLetterModal } from '@/components/ai/CoverLetterModal';
import { TailorModal } from '@/components/ai/TailorModal';
import { TipsPanel } from '@/components/tips/TipsPanel';
import { ExportModal } from '@/components/export/ExportModal';
import { CompareModal } from '@/components/editor/CompareModal';
import { BulkEditDrawer } from '@/components/editor/BulkEditDrawer';
import { FloatingAIButton } from '@/components/ai/FloatingAIButton';
import { ToastViewport } from '@/components/shared/ToastViewport';
import { OnboardingTour } from '@/components/shared/OnboardingTour';
import { BlockLibraryDrawer } from '@/components/library/BlockLibraryDrawer';
import { GenerateVariantModal } from '@/components/library/GenerateVariantModal';

export function EditorPage() {
  const { t } = useTranslation();
  const { resumeId } = useParams();
  const resume = useStore((s) => s.currentResume);
  const setCurrentResume = useStore((s) => s.setCurrentResume);
  const mobileTab = useStore((s) => s.mobileTab);
  const setMobileTab = useStore((s) => s.setMobileTab);
  const saveNow = useStore((s) => s.saveNow);
  const undoResume = useStore((s) => s.undoResume);
  const redoResume = useStore((s) => s.redoResume);

  const [isMobile, setIsMobile] = useState(false);
  const [missing, setMissing] = useState(false);
  useIdleSnapshot();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Hydrate from IndexedDB on mount / route change. We must wait for the IDB
  // hydration to complete before deciding "missing" — otherwise a hard refresh
  // on /editor/:id bounces to / before the resume is loaded into the cache.
  useEffect(() => {
    if (!resumeId) return;
    if (resume?.id === resumeId) return;
    let cancelled = false;
    const attemptLoad = () => {
      if (cancelled) return;
      const loaded = loadFromStorage(resumeId);
      if (loaded) setCurrentResume(loaded);
      else setMissing(true);
    };
    if (isHydrated()) {
      attemptLoad();
    } else {
      const unsubscribe = onHydrated(attemptLoad);
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }
    return () => {
      cancelled = true;
    };
  }, [resumeId, resume?.id, setCurrentResume]);

  // Cross-tab sync: if another tab saves the same resume, refresh the editor's
  // view with the incoming data. Skip our own broadcasts where ids don't match.
  useEffect(() => {
    if (!resumeId) return;
    let lastIncoming = '';
    return onRemoteUpdate((message) => {
      if (message.type === 'resume:save' && message.resume.id === resumeId) {
        // Only update if the incoming payload is newer than what we have.
        const incomingTs = message.resume.updatedAt;
        if (incomingTs <= lastIncoming) return;
        lastIncoming = incomingTs;
        setCurrentResume(message.resume);
        toast(t('editor.syncedFromOtherTab'), { tone: 'info', ttl: 1800 });
      } else if (message.type === 'resume:delete' && message.id === resumeId) {
        setMissing(true);
        toast(t('editor.deletedElsewhere'), { tone: 'warn' });
      }
    });
  }, [resumeId, setCurrentResume, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextEditing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      const isSave = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
      const isUndo =
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'z' &&
        !event.shiftKey;
      const isRedo =
        (event.ctrlKey || event.metaKey) &&
        ((event.key.toLowerCase() === 'z' && event.shiftKey) ||
          event.key.toLowerCase() === 'y');
      const isPrint = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p';
      if (isSave) {
        event.preventDefault();
        saveNow();
      } else if (isPrint) {
        event.preventDefault();
        window.print();
      } else if (!isTextEditing && isUndo) {
        event.preventDefault();
        undoResume();
      } else if (!isTextEditing && isRedo) {
        event.preventDefault();
        redoResume();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redoResume, saveNow, undoResume]);

  if (missing) return <Navigate to="/" replace />;
  if (!resume || resume.id !== resumeId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-subtle">
        {t('editor.loading')}
      </div>
    );
  }

  // Bridge the resume's accent color into the chrome's `--c-accent` token so
  // focus rings and AI buttons echo the user's chosen palette.
  const accentRgb = hexToRgbString(resume.styles.colors.accent);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={accentRgb ? ({ ['--c-accent' as string]: accentRgb } as React.CSSProperties) : undefined}
    >
      <EditorTopNav />

      {isMobile && (
        <div className="flex border-b border-paper-edge bg-paper" role="tablist">
          <MobileTab
            label={t('mobile.edit')}
            active={mobileTab === 'edit'}
            onClick={() => setMobileTab('edit')}
          />
          <MobileTab
            label={t('mobile.preview')}
            active={mobileTab === 'preview'}
            onClick={() => setMobileTab('preview')}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div
          className={`w-full md:w-2/5 md:max-w-xl ${
            isMobile && mobileTab !== 'edit' ? 'hidden' : 'block'
          }`}
          role={isMobile ? 'tabpanel' : undefined}
        >
          <EditorLeftPanel />
        </div>

        <div className="hidden w-px bg-paper-edge md:block" />

        <div
          className={`w-full flex-1 ${
            isMobile && mobileTab !== 'preview' ? 'hidden' : 'block'
          }`}
          role={isMobile ? 'tabpanel' : undefined}
        >
          <ResumePreview />
        </div>
      </div>

      <AIDrawer />
      <TipsPanel />
      <ExportModal />
      <CoverLetterModal />
      <TailorModalMount />
      <CompareModalMount />
      <BulkEditMount />
      <BlockLibraryDrawer />
      <GenerateVariantModal />
      <FloatingAIButton />
      <ToastViewport />
      <OnboardingTour />
    </div>
  );
}

function TailorModalMount() {
  const open = useStore((s) => s.tailorOpen);
  const setOpen = useStore((s) => s.setTailorOpen);
  return <TailorModal open={open} onClose={() => setOpen(false)} />;
}

function CompareModalMount() {
  const open = useStore((s) => s.compareOpen);
  const setOpen = useStore((s) => s.setCompareOpen);
  return <CompareModal open={open} onClose={() => setOpen(false)} />;
}

function BulkEditMount() {
  const open = useStore((s) => s.bulkEditOpen);
  const setOpen = useStore((s) => s.setBulkEditOpen);
  return <BulkEditDrawer open={open} onClose={() => setOpen(false)} />;
}

function hexToRgbString(hex: string): string | null {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length !== 6) return null;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return `${r} ${g} ${b}`;
}

function MobileTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-ink text-ink'
          : 'border-transparent text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}
