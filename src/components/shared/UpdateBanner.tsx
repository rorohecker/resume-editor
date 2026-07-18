import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileText, Replace, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  compareVersions,
  fetchLatestRelease,
  recordBackup,
  type ReleaseInfo,
} from '@/utils/updateCheck';
import { exportAllData, persistResumeNow } from '@/store/persistence';
import { flushPendingSave, useStore } from '@/store';
import {
  isFileSystemAccessSupported,
  LATEST_SINGLE_FILE_URL,
  replaceLocalFileWithLatest,
} from '@/utils/fileSync';
import { toast } from '@/hooks/useToast';

// One banner handles both deployment modes.
//
// Hosted (GitHub Pages with a service worker)
//   useRegisterSW reports `needRefresh` when a new SW is waiting. We flush
//   pending edits, apply the waiting worker, and reload automatically.
//
// Single-file html (no service worker, often opened from file://)
//   We poll the GitHub releases API and surface Download / Replace actions.

export function UpdateBanner() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const updateIntervalRef = useRef<number | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      if (updateIntervalRef.current != null) window.clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = window.setInterval(() => {
        reg.update().catch(() => {});
      }, 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    return () => {
      if (updateIntervalRef.current != null) window.clearInterval(updateIntervalRef.current);
    };
  }, []);

  // Single-file path: poll the GitHub releases API.
  useEffect(() => {
    if (!__APP_SINGLE_FILE__) return;
    let cancelled = false;
    const check = async () => {
      const latest = await fetchLatestRelease();
      if (cancelled || !latest) return;
      if (compareVersions(latest.version, `v${__APP_VERSION__}`) > 0 && latest.htmlAssetUrl) {
        setRelease(latest);
      }
    };
    void check();
    const id = window.setInterval(check, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Hosted path: flush pending edits, then apply the waiting SW and reload.
  useEffect(() => {
    if (__APP_SINGLE_FILE__) return;
    if (!needRefresh) return;
    let cancelled = false;

    const run = async () => {
      toast('Updating to the latest version…', { tone: 'info', ttl: 2000 });
      flushPendingSave();
      const current = useStore.getState().currentResume;
      if (current) {
        try {
          await persistResumeNow(current);
        } catch {
          // Best-effort — still reload so the user gets the fix.
        }
      }
      // Brief settle so any other queued IDB writes can finish.
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      if (cancelled) return;
      void updateServiceWorker(true);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [needRefresh, updateServiceWorker]);

  // Hosted updates auto-reload; only keep the interactive banner for single-file.
  if (!__APP_SINGLE_FILE__) return null;
  if (!release || dismissed) return null;

  const downloadBackup = () => {
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
    });
  };

  const replaceLocal = async () => {
    if (replacing) return;
    setReplacing(true);
    try {
      const outcome = await replaceLocalFileWithLatest();
      if (outcome.ok) {
        toast(
          `Replaced ${outcome.filename ?? 'your existing file'}. Close this tab and re-open the file to load the new version.`,
          { tone: 'success', ttl: 6000 },
        );
        setDismissed(true);
      } else if (outcome.cancelled) {
        // No-op — the user dismissed the picker.
      } else if (outcome.error) {
        toast(outcome.error, { tone: 'warn', ttl: 5000 });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Replace failed.', {
        tone: 'danger',
        ttl: 5000,
      });
    } finally {
      setReplacing(false);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-2xl items-start gap-3 rounded-lg border border-accent/40 bg-paper p-4 shadow-page">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Download size={16} />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold text-ink">
            Version {release.name || release.version} is available
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Update in place (Chrome / Edge) or download a fresh copy. The Replace button fetches the
            latest build from the live site and overwrites the file you pick.
          </p>

          {release.body && (
            <div className="mt-2 rounded border border-paper-edge bg-paper-tint">
              <button
                type="button"
                onClick={() => setShowNotes((v) => !v)}
                className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-medium text-ink-muted hover:text-ink"
                aria-expanded={showNotes}
              >
                {showNotes ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <FileText size={11} />
                <span>What is new in {release.name || release.version}</span>
              </button>
              {showNotes && (
                <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap px-3 pb-2 text-[11px] leading-snug text-ink-muted">
                  {release.body.slice(0, 6000)}
                  {release.body.length > 6000 ? '\n…' : ''}
                </pre>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={downloadBackup} className="btn-secondary text-xs">
              Back up data
            </button>
            {isFileSystemAccessSupported() ? (
              <button
                type="button"
                onClick={() => void replaceLocal()}
                disabled={replacing}
                className="btn-primary text-xs"
                title={`Fetches the latest build from ${LATEST_SINGLE_FILE_URL} and overwrites the local file you pick.`}
              >
                <Replace size={12} />
                {replacing ? 'Replacing…' : 'Replace this file in place'}
              </button>
            ) : (
              release.htmlAssetUrl && (
                <a
                  href={release.htmlAssetUrl}
                  download={`resume-editor-${release.version}.html`}
                  rel="noopener noreferrer"
                  className="btn-primary text-xs"
                >
                  <Download size={12} />
                  Download {release.version}
                </a>
              )
            )}
            {isFileSystemAccessSupported() && release.htmlAssetUrl && (
              <a
                href={release.htmlAssetUrl}
                download={`resume-editor-${release.version}.html`}
                rel="noopener noreferrer"
                className="btn-secondary text-xs"
              >
                <Download size={12} />
                Download as new file
              </a>
            )}
            <a
              href="https://rorohecker.github.io/resume-editor/update.html"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-xs"
              title="Hosted helper page that overwrites your local file. Works even if this version's Replace button is broken."
            >
              Stuck? Use the hosted updater
            </a>
            {release.releaseUrl && (
              <a
                href={release.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-xs"
              >
                Open on GitHub
              </a>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="icon-btn h-7 w-7 flex-shrink-0"
          title="Dismiss"
          aria-label="Dismiss update notice"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
