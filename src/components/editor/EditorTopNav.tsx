import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  Eye,
  EyeOff,
  FileText,
  GitCompare,
  HardDriveDownload,
  Layers,
  Library,
  ListChecks,
  Undo2,
  Redo2,
  History,
  Download,
  Upload,
  Sparkles,
  Lightbulb,
  ChevronDown,
  Check,
  Wand2,
  AlertTriangle,
  PanelLeftOpen,
} from 'lucide-react';
import { useStore, onResumeSaved } from '@/store';
import { ChangeTemplateMenu } from './ChangeTemplateMenu';
import { ImportResumeModal } from '@/components/import/ImportResumeModal';
import { SaveSnapshotModal } from './SaveSnapshotModal';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { AccentToggle } from '@/components/shared/AccentToggle';
import { SnapshotRestoreModal } from './SnapshotRestoreModal';
import { ApplicationEditor } from '@/components/jobs/ApplicationEditor';
import { MoreActionsMenu } from './MoreActionsMenu';
import {
  deleteVersionSnapshot,
  exportAllData,
  listVersionSnapshots,
} from '@/store/persistence';
import { toast } from '@/hooks/useToast';
import { lastBackupAt, recordBackup } from '@/utils/updateCheck';
import { FileSyncControl } from './FileSyncControl';
import { appendImportReference } from '@/utils/importReference';

export function EditorTopNav() {
  const { t } = useTranslation();
  const resume = useStore((s) => s.currentResume);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const updateResume = useStore((s) => s.updateCurrentResume);
  const undoResume = useStore((s) => s.undoResume);
  const redoResume = useStore((s) => s.redoResume);
  const saveNow = useStore((s) => s.saveNow);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const setTipsOpen = useStore((s) => s.setTipsOpen);
  const setExportOpen = useStore((s) => s.setExportOpen);
  const setTailorOpen = useStore((s) => s.setTailorOpen);
  const setCompareOpen = useStore((s) => s.setCompareOpen);
  const setBulkEditOpen = useStore((s) => s.setBulkEditOpen);
  const setLibraryOpen = useStore((s) => s.setLibraryOpen);
  const setVariantOpen = useStore((s) => s.setVariantOpen);
  const pdfPreviewMode = useStore((s) => s.pdfPreviewMode);
  const setPdfPreviewMode = useStore((s) => s.setPdfPreviewMode);
  const anonymized = useStore((s) => s.anonymized);
  const setAnonymized = useStore((s) => s.setAnonymized);
  const aiOpen = useStore((s) => s.aiOpen);
  const tipsOpen = useStore((s) => s.tipsOpen);
  const importReferenceOpen = useStore((s) => s.importReferenceOpen);
  const importReferenceAvailable = useStore((s) => s.importReferenceAvailable);
  const setImportReferenceOpen = useStore((s) => s.setImportReferenceOpen);

  const [editingName, setEditingName] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [savedHint, setSavedHint] = useState('');
  const persistError = useStore((s) => s.persistError);
  const [restoreCandidate, setRestoreCandidate] = useState<ReturnType<typeof listVersionSnapshots>[number] | null>(null);
  const snapshots = useMemo(
    () => (resume ? listVersionSnapshots(resume.id) : []),
    [resume, historyVersion],
  );

  // Show a tiny "saved" hint near the resume name on every successful autosave.
  useEffect(() => {
    return onResumeSaved(() => {
      setSavedHint(t('editor.saved'));
      window.setTimeout(() => setSavedHint(''), 1500);
    });
  }, [t]);

  if (!resume) return null;

  return (
    <>
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-paper-edge bg-paper px-4">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          to="/"
          className="flex items-center gap-2 text-ink hover:text-ink-soft"
          title={t('editor.backToGallery')}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-paper">
            <FileText size={16} />
          </div>
        </Link>
        <div className="hidden h-6 w-px bg-paper-edge sm:block" />
        <div className="flex min-w-0 items-center gap-1">
          {editingName ? (
            <input
              autoFocus
              type="text"
              value={resume.name}
              onChange={(e) => updateResume((current) => ({ ...current, name: e.target.value }))}
              onBlur={() => {
                saveNow();
                setEditingName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false);
              }}
              className="w-48 rounded border border-paper-edge bg-paper px-2 py-1 text-sm font-medium text-ink focus:border-accent focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="truncate rounded px-2 py-1 text-sm font-medium text-ink hover:bg-paper-tint"
              title={t('editor.rename')}
            >
              {resume.name}
            </button>
          )}
          {persistError ? (
            <button
              type="button"
              className="ml-2 inline-flex max-w-[12rem] items-center gap-1 truncate text-xs text-danger"
              title={persistError}
              onClick={() => saveNow()}
            >
              <AlertTriangle size={12} /> {t('editor.saveFailed')}
            </button>
          ) : savedHint ? (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-ink-subtle" role="status">
              <Check size={12} className="text-ok" /> {t('editor.saved')}
            </span>
          ) : (
            <BackupHint />
          )}
          <div className="ml-2 hidden md:block">
            <ApplicationEditor
              resume={resume}
              compact
              onChange={(next) => updateResume((r) => ({ ...r, application: next }))}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="icon-btn"
          title={`${t('editor.undo')} (Ctrl+Z)`}
          aria-label={t('editor.undo')}
          disabled={past.length === 0}
          onClick={undoResume}
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={`${t('editor.redo')} (Ctrl+Shift+Z)`}
          aria-label={t('editor.redo')}
          disabled={future.length === 0}
          onClick={redoResume}
        >
          <Redo2 size={16} />
        </button>
        <div className="relative">
          <button
            type="button"
            className={`icon-btn ${historyOpen ? 'bg-paper-tint text-ink' : ''}`}
            title={t('editor.history')}
            aria-label={t('editor.history')}
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <History size={16} />
            <ChevronDown size={10} className="-ml-1" />
          </button>
          {historyOpen && (
            <div className="absolute right-0 z-40 mt-2 w-80 rounded-md border border-paper-edge bg-paper p-3 shadow-page">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {t('snapshot.versionHistory')}
                </h3>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => {
                    setHistoryOpen(false);
                    setSnapshotOpen(true);
                  }}
                >
                  {t('editor.saveSnapshot')}
                </button>
              </div>
              {snapshots.length === 0 ? (
                <p className="text-xs text-ink-subtle">{t('snapshot.noSnapshots')}</p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {snapshots.map((snapshot) => (
                    <div key={snapshot.id} className="rounded-md border border-paper-edge p-2">
                      <div className="text-sm font-medium text-ink">{snapshot.name}</div>
                      <div className="text-xs text-ink-subtle">
                        {new Date(snapshot.createdAt).toLocaleString()}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          onClick={() => {
                            setRestoreCandidate(snapshot);
                            setHistoryOpen(false);
                          }}
                        >
                          {t('snapshot.restoreItem')}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost text-xs"
                          onClick={() => {
                            deleteVersionSnapshot(resume.id, snapshot.id);
                            setHistoryVersion((value) => value + 1);
                          }}
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mx-2 h-6 w-px bg-paper-edge" />

        <ChangeTemplateMenu />
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="icon-btn"
          title={t('editor.importMerge')}
          aria-label={t('editor.importMerge')}
        >
          <Upload size={16} />
        </button>
        {importReferenceAvailable && (
          <button
            type="button"
            className={`icon-btn ${importReferenceOpen ? 'bg-paper-tint text-ink' : ''}`}
            title={
              importReferenceOpen
                ? t('importReference.hide')
                : t('importReference.toggle')
            }
            aria-label={
              importReferenceOpen
                ? t('importReference.hide')
                : t('importReference.toggle')
            }
            aria-pressed={importReferenceOpen}
            onClick={() => setImportReferenceOpen(!importReferenceOpen)}
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
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
          }}
          className="icon-btn"
          title={t('editor.backupNow', { defaultValue: 'Back up all resumes (JSON)' })}
          aria-label={t('editor.backupNow', { defaultValue: 'Back up all resumes (JSON)' })}
        >
          <HardDriveDownload size={16} />
        </button>
        <FileSyncControl />
        <button
          type="button"
          className="icon-btn"
          title={t('editor.saveSnapshot')}
          aria-label={t('editor.saveSnapshot')}
          onClick={() => setSnapshotOpen(true)}
        >
          <Bookmark size={16} />
        </button>
        {/* Wide screens: full icon strip. Narrow screens: collapsed into More menu. */}
        <div className="hidden items-center gap-1 xl:flex">
          <button
            type="button"
            data-tour="library-button"
            className="icon-btn"
            title={t('library.title')}
            aria-label={t('library.title')}
            onClick={() => setLibraryOpen(true)}
          >
            <Library size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title={t('variant.title')}
            aria-label={t('variant.title')}
            onClick={() => setVariantOpen(true)}
          >
            <Layers size={16} />
          </button>
          <button
            type="button"
            data-tour="tailor-button"
            className="icon-btn"
            title={t('editor.tailorToJob')}
            aria-label={t('editor.tailorToJob')}
            onClick={() => setTailorOpen(true)}
          >
            <Wand2 size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title={t('editor.compare')}
            aria-label={t('editor.compare')}
            onClick={() => setCompareOpen(true)}
          >
            <GitCompare size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title={t('editor.bulkEdit')}
            aria-label={t('editor.bulkEdit')}
            onClick={() => setBulkEditOpen(true)}
          >
            <ListChecks size={16} />
          </button>
          <button
            type="button"
            className={`icon-btn ${pdfPreviewMode ? 'bg-paper-tint text-ink' : ''}`}
            title={pdfPreviewMode ? t('editor.pdfPreviewOn') : t('editor.pdfPreviewOff')}
            aria-label={t('editor.togglePdfPreview')}
            aria-pressed={pdfPreviewMode}
            onClick={() => setPdfPreviewMode(!pdfPreviewMode)}
          >
            <FileText size={16} />
          </button>
          <button
            type="button"
            className={`icon-btn ${anonymized ? 'bg-paper-tint text-ink' : ''}`}
            title={anonymized ? t('editor.anonymizeOn') : t('editor.anonymizeOff')}
            aria-label={anonymized ? t('editor.anonymizeOn') : t('editor.anonymizeOff')}
            aria-pressed={anonymized}
            onClick={() => setAnonymized(!anonymized)}
          >
            {anonymized ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <div className="xl:hidden">
          <MoreActionsMenu />
        </div>

        <div className="mx-2 h-6 w-px bg-paper-edge" />

        <button
          type="button"
          onClick={() => setTipsOpen(!tipsOpen)}
          className={`icon-btn ${tipsOpen ? 'bg-paper-tint text-ink' : ''}`}
          title={t('editor.tips')}
          aria-label={t('editor.tips')}
          aria-pressed={tipsOpen}
        >
          <Lightbulb size={16} />
        </button>
        <button
          type="button"
          onClick={() => setAiOpen(!aiOpen)}
          className={`icon-btn ${aiOpen ? 'bg-paper-tint text-ink' : ''}`}
          title={t('editor.aiAssistant')}
          aria-label={t('editor.aiAssistant')}
          aria-pressed={aiOpen}
        >
          <Sparkles size={16} />
        </button>

        <div className="mx-2 hidden h-6 w-px bg-paper-edge md:block" />
        <div className="hidden items-center gap-1 md:flex">
          <AccentToggle compact />
          <ThemeToggle compact />
        </div>

        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="btn-primary ml-2"
          aria-label={t('editor.export')}
        >
          <Download size={14} />
          {t('editor.export')}
        </button>
      </div>
    </header>
    <ImportResumeModal
      open={importOpen}
      mode="merge"
      onClose={() => setImportOpen(false)}
      onImported={async (imported, _mode, meta) => {
        updateResume((current) => ({
          ...current,
          sections: [
            ...current.sections,
            ...imported.sections.map((section, index) => ({
              ...section,
              id: `${section.id}-${Date.now().toString(36)}-${index}`,
              title: t('editor.importedSectionTitle', { title: section.title }),
              order: current.sections.length + index,
            })),
          ],
        }));
        if (meta?.sourceText.trim()) {
          try {
            await appendImportReference(resume.id, meta.sourceText, meta.sourceName);
            useStore.getState().bumpImportReference();
          } catch {
            toast(t('importReference.saveFailed'), { tone: 'danger' });
          }
        }
        toast(t('editor.importedSections', { count: imported.sections.length }), { tone: 'success' });
      }}
    />
    <SaveSnapshotModal
      open={snapshotOpen}
      onClose={() => setSnapshotOpen(false)}
      onSaved={() => {
        saveNow();
        setHistoryVersion((value) => value + 1);
      }}
    />
    <SnapshotRestoreModal
      open={Boolean(restoreCandidate)}
      current={resume}
      snapshot={restoreCandidate}
      onClose={() => setRestoreCandidate(null)}
      onConfirm={(snapshot) => {
        updateResume(() => ({
          ...snapshot.resume,
          id: resume.id,
          updatedAt: new Date().toISOString(),
        }));
        setRestoreCandidate(null);
        toast(t('snapshot.restored', { name: snapshot.name }), { tone: 'success' });
      }}
    />
    </>
  );
}

// Small hint near the resume name: when was the last JSON backup taken?
// Stays muted and quiet until we're more than a day stale, then gets a
// gentle nudge color. Disappears the moment a save indicator is showing.
function BackupHint() {
  const [, force] = useState(0);
  // Re-render on a slow interval so "5 minutes ago" becomes "an hour ago".
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const ts = lastBackupAt();
  if (!ts) {
    return (
      <span className="ml-2 hidden text-xs text-ink-subtle md:inline" title="No JSON backup has been saved yet">
        · Not backed up
      </span>
    );
  }
  const minutes = (Date.now() - ts) / 60_000;
  const stale = minutes > 60 * 24 * 7;
  const text =
    minutes < 1 ? 'Backed up just now'
    : minutes < 60 ? `Backed up ${Math.floor(minutes)}m ago`
    : minutes < 60 * 24 ? `Backed up ${Math.floor(minutes / 60)}h ago`
    : `Backed up ${Math.floor(minutes / 60 / 24)}d ago`;
  return (
    <span
      className={`ml-2 hidden text-xs md:inline ${stale ? 'text-warn' : 'text-ink-subtle'}`}
      title={new Date(ts).toLocaleString()}
    >
      · {text}
    </span>
  );
}
