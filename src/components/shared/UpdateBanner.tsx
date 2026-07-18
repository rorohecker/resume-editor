import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileText, Loader2, Rocket, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  compareVersions,
  fetchLatestRelease,
  recordBackup,
  type ReleaseInfo,
} from '@/utils/updateCheck';
import {
  exportAllData,
  importAllData,
  isFullAppBackup,
  persistResumeNow,
} from '@/store/persistence';
import { flushPendingSave, useStore } from '@/store';
import { toast } from '@/hooks/useToast';

const HOSTED_APP_URL = 'https://rorohecker.github.io/resume-editor/';
const HOSTED_ORIGIN = new URL(HOSTED_APP_URL).origin;

type MigrationMessage =
  | { type: 'resume-editor:migration-ready'; token: string }
  | { type: 'resume-editor:migration-data'; token: string; payload: unknown }
  | { type: 'resume-editor:migration-complete'; token: string; resumes: number }
  | { type: 'resume-editor:migration-error'; token: string; message: string };

// One banner handles both deployment modes.
//
// Hosted (GitHub Pages with a service worker)
//   useRegisterSW reports `needRefresh` when a new SW is waiting. We flush
//   pending edits, apply the waiting worker, and reload automatically.
//
// Single-file html (no service worker, often opened from file://)
//   We poll releases, then migrate local data into the hosted PWA and relaunch
//   there. This avoids browser-mandated file pickers and enables future updates
//   to apply automatically.

export function UpdateBanner() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [migrating, setMigrating] = useState(false);
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

  // Hosted receiver for one-click migration from the downloaded HTML build.
  // The random token ties the payload to the window that initiated this launch.
  useEffect(() => {
    if (__APP_SINGLE_FILE__) return;
    const query = window.location.hash.split('?')[1] ?? '';
    const token = new URLSearchParams(query).get('migration');
    if (!token || !window.opener) return;

    let completed = false;
    const announceReady = () => {
      if (completed) return;
      window.opener?.postMessage(
        { type: 'resume-editor:migration-ready', token } satisfies MigrationMessage,
        '*',
      );
    };

    const onMessage = async (event: MessageEvent<MigrationMessage>) => {
      if (event.source !== window.opener) return;
      const message = event.data;
      if (message?.type !== 'resume-editor:migration-data' || message.token !== token) return;
      completed = true;
      try {
        if (!isFullAppBackup(message.payload)) {
          throw new Error('The local data transfer was not a valid backup.');
        }
        const result = await importAllData(message.payload);
        window.opener?.postMessage(
          {
            type: 'resume-editor:migration-complete',
            token,
            resumes: result.resumes,
          } satisfies MigrationMessage,
          '*',
        );
        window.setTimeout(() => window.location.replace(HOSTED_APP_URL), 250);
      } catch (err) {
        window.opener?.postMessage(
          {
            type: 'resume-editor:migration-error',
            token,
            message: err instanceof Error ? err.message : 'Migration failed.',
          } satisfies MigrationMessage,
          '*',
        );
      }
    };

    window.addEventListener('message', onMessage);
    announceReady();
    const readyTimer = window.setInterval(announceReady, 500);
    return () => {
      completed = true;
      window.clearInterval(readyTimer);
      window.removeEventListener('message', onMessage);
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

  const migrateAndRelaunch = () => {
    if (migrating) return;
    setMigrating(true);
    const token =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const migrationUrl = `${HOSTED_APP_URL}#/?migration=${encodeURIComponent(token)}`;
    let popup: Window | null = null;
    let sent = false;

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      setMigrating(false);
    };

    const fail = (message: string) => {
      cleanup();
      popup?.close();
      toast(message, { tone: 'danger', ttl: 6000 });
    };

    const onMessage = async (event: MessageEvent<MigrationMessage>) => {
      if (event.origin !== HOSTED_ORIGIN || event.source !== popup) return;
      const message = event.data;
      if (!message || message.token !== token) return;

      if (message.type === 'resume-editor:migration-ready' && !sent) {
        sent = true;
        try {
          flushPendingSave();
          const current = useStore.getState().currentResume;
          if (current) await persistResumeNow(current);
          const payload = await exportAllData();
          popup?.postMessage(
            { type: 'resume-editor:migration-data', token, payload } satisfies MigrationMessage,
            HOSTED_ORIGIN,
          );
        } catch (err) {
          fail(err instanceof Error ? err.message : 'Could not prepare local data for update.');
        }
      } else if (message.type === 'resume-editor:migration-complete') {
        cleanup();
        popup?.close();
        // Relaunch this tab on the hosted PWA. Data is already restored there,
        // and every future update can apply without another file picker.
        window.location.assign(HOSTED_APP_URL);
      } else if (message.type === 'resume-editor:migration-error') {
        fail(message.message);
      }
    };

    window.addEventListener('message', onMessage);
    const timeout = window.setTimeout(() => {
      fail('The online updater did not respond. Check your connection and try again.');
    }, 20_000);

    popup = window.open(migrationUrl, 'resume-editor-update', 'popup,width=720,height=760');
    if (!popup) {
      fail('Your browser blocked the updater window. Allow pop-ups and try again.');
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
            Move to the auto-updating web app and relaunch with all your resumes—no file picker or
            old-version selection required.
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
            <button
              type="button"
              onClick={migrateAndRelaunch}
              disabled={migrating}
              className="btn-primary text-xs"
            >
              {migrating ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
              {migrating ? 'Moving your data…' : 'Update & relaunch'}
            </button>
            {release.htmlAssetUrl && (
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
