import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileText, RefreshCcw, Replace, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  compareVersions,
  fetchLatestRelease,
  recordBackup,
  type ReleaseInfo,
} from '@/utils/updateCheck';
import { exportAllData } from '@/store/persistence';
import {
  isFileSystemAccessSupported,
  LATEST_SINGLE_FILE_URL,
  replaceLocalFileWithLatest,
} from '@/utils/fileSync';
import { toast } from '@/hooks/useToast';

// One banner handles both deployment modes.
//
// Hosted (GitHub Pages with a service worker)
//   useRegisterSW reports `needRefresh` when a new SW is waiting. We also try
//   to fetch the matching release notes from the GitHub API so the user can
//   preview what they're about to install before reloading.
//
// Single-file html (no service worker, often opened from file://)
//   We poll the GitHub releases API and surface a Download link (always
//   reliable — browser handles the navigation) plus an optional Replace flow
//   for Chromium browsers. The Replace flow uses two File System Access
//   pickers to do a pure file-to-file copy and never goes through fetch(), so
//   it side-steps the CORS issue that bites file:// origins trying to fetch
//   GitHub asset URLs.

export function UpdateBanner() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      window.setInterval(() => {
        reg.update().catch(() => {});
      }, 60 * 60 * 1000);
    },
  });

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

  // Hosted path: when the SW reports an update is ready, also pull the
  // matching release notes so the user gets a preview before reloading.
  useEffect(() => {
    if (__APP_SINGLE_FILE__) return;
    if (!needRefresh) return;
    if (release) return;
    let cancelled = false;
    void fetchLatestRelease().then((latest) => {
      if (!cancelled && latest) setRelease(latest);
    });
    return () => {
      cancelled = true;
    };
  }, [needRefresh, release]);

  const kind: 'hosted' | 'singleFile' | null =
    needRefresh && !__APP_SINGLE_FILE__
      ? 'hosted'
      : __APP_SINGLE_FILE__ && release
        ? 'singleFile'
        : null;
  if (!kind || dismissed) return null;

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

  // Single-picker replace: fetch the always-latest single-file html from
  // GitHub Pages (CORS:* enabled), then ask the user once to pick their
  // local file to overwrite. No manual download, no second picker.
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

  const headline =
    kind === 'hosted'
      ? release
        ? `Version ${release.name || release.version} is ready`
        : 'A new version is ready'
      : `Version ${release?.name || release?.version} is available`;

  const summary =
    kind === 'hosted'
      ? 'Your local IndexedDB data survives the reload. Back up first if you want extra safety.'
      : 'Update in place (Chrome / Edge) or download a fresh copy. The Replace button fetches the latest build from the live site and overwrites the file you pick.';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-2xl items-start gap-3 rounded-lg border border-accent/40 bg-paper p-4 shadow-page">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          {kind === 'hosted' ? <RefreshCcw size={16} /> : <Download size={16} />}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold text-ink">{headline}</div>
          <p className="mt-1 text-xs text-ink-muted">{summary}</p>

          {release?.body && (
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
            {kind === 'hosted' ? (
              <button
                type="button"
                onClick={() => {
                  void updateServiceWorker(true);
                }}
                className="btn-primary text-xs"
              >
                <RefreshCcw size={12} />
                Reload to update
              </button>
            ) : (
              <>
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
                  release?.htmlAssetUrl && (
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
                {isFileSystemAccessSupported() && release?.htmlAssetUrl && (
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
              </>
            )}
            {release?.releaseUrl && (
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
