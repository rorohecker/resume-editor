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

// One banner handles both update paths. The user always gets the release
// notes in-place before any download happens, plus an in-place replace
// option (Chrome/Edge) so the new html overwrites the existing file rather
// than dropping a second copy in Downloads.

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

  const kind: 'hosted' | 'singleFile' | null =
    needRefresh && !__APP_SINGLE_FILE__ ? 'hosted' : release ? 'singleFile' : null;
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
      // Fetch first so the user only sees the file picker if the download
      // actually succeeded. Failure here gets a toast instead of a half-broken
      // overwrite.
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

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-2xl items-start gap-3 rounded-lg border border-accent/40 bg-paper p-4 shadow-page">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          {kind === 'hosted' ? <RefreshCcw size={16} /> : <Download size={16} />}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold text-ink">
            {kind === 'hosted'
              ? 'A new version is ready'
              : `Version ${release?.version} is available`}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {kind === 'hosted'
              ? 'Your local data stays in IndexedDB and survives the reload. Back up first if you want extra safety.'
              : 'Preview what is new below, then either replace your existing html file in place (Chrome / Edge) or download a fresh copy. Back up your data first — opening the new file from a different folder starts an empty database.'}
          </p>

          {kind === 'singleFile' && release?.body && (
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
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap px-3 pb-2 text-[11px] leading-snug text-ink-muted">
                  {release.body.slice(0, 4000)}
                  {release.body.length > 4000 ? '\n…' : ''}
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
            {kind === 'singleFile' && release && (
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
