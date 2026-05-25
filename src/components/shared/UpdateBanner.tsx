import { useEffect, useState } from 'react';
import { Download, RefreshCcw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  compareVersions,
  fetchLatestRelease,
  recordBackup,
  type ReleaseInfo,
} from '@/utils/updateCheck';
import { exportAllData } from '@/store/persistence';

// One banner handles both update paths.
// Hosted (GitHub Pages): vite-plugin-pwa's useRegisterSW reports when a new
// service worker is waiting. We surface a reload prompt.
// Single-file html: we poll the GitHub releases API on load and once an hour
// and surface a download prompt when the latest tag is newer.
// Either way the user is nudged to back up their data first because the
// hosted IDB and the file:// IDB are separate origins, and replacing the
// single-file html in a different folder starts a fresh database.

export function UpdateBanner() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Hosted path. When PWA is disabled (single-file build), useRegisterSW is
  // stubbed by the plugin and reports no updates — safe to import.
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Re-check for updates once an hour in long-running sessions.
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
              : 'Your single-file build is out of date. Download the new file and replace your local copy. Back up your data first — opening the new file from a different folder starts an empty database.'}
          </p>
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
            ) : release?.htmlAssetUrl ? (
              <a
                href={release.htmlAssetUrl}
                download={`resume-editor-${release.version}.html`}
                rel="noopener noreferrer"
                className="btn-primary text-xs"
              >
                Download {release.version}
              </a>
            ) : null}
            {kind === 'singleFile' && release && (
              <a
                href={release.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-xs"
              >
                Release notes
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
