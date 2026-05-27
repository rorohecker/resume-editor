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
import { isFileSystemAccessSupported, replaceExistingHtmlFile } from '@/utils/fileSync';
import { toast } from '@/hooks/useToast';

// One banner handles both deployment modes.
// Hosted (GitHub Pages with a service worker): vite-plugin-pwa fires
//   `needRefresh` when a new SW is waiting. We surface a reload prompt AND we
//   also fetch the matching release notes from the GitHub API so the user can
//   preview what they're about to install.
// Single-file html (no service worker): we poll the GitHub releases API and
//   surface a Replace-in-place button (Chrome / Edge via the File System
//   Access API) plus a fall-back Download link.

export function UpdateBanner() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [replacing, setReplacing] = useState(false);

  // Hosted SW update detection.
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
      if (
        compareVersions(latest.version, `v${__APP_VERSION__}`) > 0 &&
        latest.htmlAssetUrl
      ) {
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

  // Hosted path: when the SW reports an update is ready, also fetch the
  // matching release notes so the user can preview them before reloading.
  // Fails silent if the API is unreachable — the reload button still works.
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
    needRefresh && !__APP_SINGLE_FILE__ ? 'hosted' : __APP_SINGLE_FILE__ && release ? 'singleFile' : null;
  if (!kind || dismissed) return null;

  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(exportAllData(), null, 2)], {
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
  };

  const replaceCurrentFile = async () => {
    if (!release?.htmlAssetUrl) return;
    setReplacing(true);
    try {
      const resp = await fetch(release.htmlAssetUrl);
      if (!resp.ok) {
        toast('Could not download the new version. Try the Download button.', {
          tone: 'warn',
          ttl: 4000,
        });
        return;
      }
      const buffer = await resp.arrayBuffer();
      const outcome = await replaceExistingHtmlFile(buffer);
      if (outcome.ok) {
        toast(`Replaced ${outcome.filename ?? 'your local file'}. Re-open it to load the new version.`, {
          tone: 'success',
          ttl: 5000,
        });
        setDismissed(true);
      } else if (outcome.error) {
        toast(outcome.error, { tone: 'warn', ttl: 4000 });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Replace failed.', {
        tone: 'danger',
        ttl: 4000,
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
      ? 'Your local IndexedDB data survives the reload. Back up if you want extra safety.'
      : 'Preview what is new below, then either replace your existing html file in place (Chrome / Edge) or download a fresh copy. Back up your data first — opening the new file from a different folder starts an empty database.';

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
                {release?.htmlAssetUrl && isFileSystemAccessSupported() && (
                  <button
                    type="button"
                    onClick={replaceCurrentFile}
                    disabled={replacing}
                    className="btn-primary text-xs"
                  >
                    <Replace size={12} />
                    {replacing ? 'Replacing…' : 'Replace existing file'}
                  </button>
                )}
                {release?.htmlAssetUrl && (
                  <a
                    href={release.htmlAssetUrl}
                    download={`resume-editor-${release.version}.html`}
                    rel="noopener noreferrer"
                    className={isFileSystemAccessSupported() ? 'btn-secondary text-xs' : 'btn-primary text-xs'}
                  >
                    <Download size={12} />
                    {isFileSystemAccessSupported() ? 'Download as new file' : `Download ${release.version}`}
                  </a>
                )}
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
