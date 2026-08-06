import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileText, Loader2, Rocket, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  fetchLatestRelease,
  isNewerRelease,
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
const SW_UPDATE_MS = 15 * 60 * 1000;
/** Soft cap for window.name handoff; larger payloads get originals stripped first. */
const MIGRATION_HANDOFF_MAX_CHARS = 4_500_000;
const MIGRATION_HANDOFF_TYPE = 'resume-editor:migration-handoff';

type MigrationHandoff = {
  type: typeof MIGRATION_HANDOFF_TYPE;
  token: string;
  payload: unknown;
};

// One banner handles both deployment modes.
//
// Hosted (GitHub Pages with a service worker)
//   registerType: 'autoUpdate' activates a waiting worker. We flush pending
//   edits, then reload explicitly — vite-plugin-pwa no longer reloads from
//   updateServiceWorker(true) alone.
//
// Single-file html (no service worker, often opened from file://)
//   We poll releases, then migrate local data into the hosted PWA in the same
//   tab via window.name (survives cross-origin navigation) and relaunch there.

async function flushBeforeReload(): Promise<void> {
  flushPendingSave();
  const current = useStore.getState().currentResume;
  if (current) {
    try {
      await persistResumeNow(current);
    } catch {
      // Best-effort — still reload so the user gets the fix.
    }
  }
  await new Promise((resolve) => window.setTimeout(resolve, 250));
}

/** Drop heavy PDF/DOCX originals so the handoff fits in window.name. */
function slimMigrationPayload(payload: Awaited<ReturnType<typeof exportAllData>>) {
  const importReferences: Record<string, { text: string; sourceName?: string; importedAt?: string }> =
    {};
  for (const [id, reference] of Object.entries(payload.importReferences ?? {})) {
    if (!reference || typeof reference !== 'object') continue;
    const text = (reference as { text?: unknown }).text;
    if (typeof text !== 'string' || !text.trim()) continue;
    const sourceName = (reference as { sourceName?: unknown }).sourceName;
    const importedAt = (reference as { importedAt?: unknown }).importedAt;
    importReferences[id] = {
      text,
      sourceName: typeof sourceName === 'string' ? sourceName : undefined,
      importedAt: typeof importedAt === 'string' ? importedAt : undefined,
    };
  }
  return { ...payload, importReferences };
}

function readMigrationHandoff(token: string): MigrationHandoff | null {
  try {
    const raw = window.name;
    if (!raw || !raw.includes(MIGRATION_HANDOFF_TYPE)) return null;
    const parsed = JSON.parse(raw) as Partial<MigrationHandoff>;
    if (parsed.type !== MIGRATION_HANDOFF_TYPE || parsed.token !== token) return null;
    if (!parsed.payload) return null;
    window.name = '';
    return parsed as MigrationHandoff;
  } catch {
    return null;
  }
}

export function UpdateBanner() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const updateIntervalRef = useRef<number | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadStartedRef = useRef(false);

  const reloadToLatest = useRef(() => {
    if (reloadStartedRef.current) return;
    reloadStartedRef.current = true;
    toast('Updating to the latest version…', { tone: 'info', ttl: 2000 });
    void flushBeforeReload().finally(() => {
      window.location.reload();
    });
  });

  const {
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      registrationRef.current = reg;
      if (updateIntervalRef.current != null) window.clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = window.setInterval(() => {
        reg.update().catch(() => {});
      }, SW_UPDATE_MS);
      // Catch updates that arrived while this tab was open.
      void reg.update().catch(() => {});
    },
    // autoUpdate path: new SW activated — flush then hard-reload.
    onNeedReload() {
      reloadToLatest.current();
    },
    // prompt/fallback path: a waiting worker is ready — activate + reload.
    onNeedRefresh() {
      void (async () => {
        await flushBeforeReload();
        // Guarantee a reload even if workbox's controlling.isUpdate is false.
        const onControllerChange = () => {
          navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
          if (!reloadStartedRef.current) {
            reloadStartedRef.current = true;
            window.location.reload();
          }
        };
        navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);
        try {
          await updateServiceWorker();
        } catch {
          // fall through to timeout reload
        }
        window.setTimeout(() => {
          navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
          if (!reloadStartedRef.current) {
            reloadStartedRef.current = true;
            window.location.reload();
          }
        }, 1200);
      })();
    },
  });

  useEffect(() => {
    return () => {
      if (updateIntervalRef.current != null) window.clearInterval(updateIntervalRef.current);
    };
  }, []);

  // Check for a new SW when the tab becomes visible again (hourly alone was too slow).
  useEffect(() => {
    if (__APP_SINGLE_FILE__) return;
    const check = () => {
      void registrationRef.current?.update().catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Hosted receiver for same-tab migration from the downloaded HTML build.
  // window.name survives the cross-origin navigation from file:// → Pages.
  useEffect(() => {
    if (__APP_SINGLE_FILE__) return;
    const query = window.location.hash.split('?')[1] ?? '';
    const token = new URLSearchParams(query).get('migration');
    if (!token) return;

    const handoff = readMigrationHandoff(token);
    if (!handoff) return;

    let cancelled = false;
    toast('Restoring your resumes in the online app…', { tone: 'info', ttl: 2500 });
    void (async () => {
      try {
        if (!isFullAppBackup(handoff.payload)) {
          throw new Error('The local data transfer was not a valid backup.');
        }
        const result = await importAllData(handoff.payload);
        if (cancelled) return;
        toast(`Restored ${result.resumes} resume${result.resumes === 1 ? '' : 's'}.`, {
          tone: 'success',
          ttl: 2500,
        });
        window.setTimeout(() => window.location.replace(HOSTED_APP_URL), 400);
      } catch (err) {
        if (cancelled) return;
        window.name = '';
        toast(err instanceof Error ? err.message : 'Migration failed.', {
          tone: 'danger',
          ttl: 6000,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Both modes: poll GitHub releases. Hosted also relies on the service worker,
  // but Pages can lag behind a published tag — the banner covers that gap.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const latest = await fetchLatestRelease();
      if (cancelled || !latest) return;
      if (!isNewerRelease(latest.version)) {
        setRelease(null);
        return;
      }
      setRelease(latest);
      // Nudge the SW in case Pages already has the new assets but this tab
      // hasn't picked them up yet.
      if (!__APP_SINGLE_FILE__) {
        void registrationRef.current?.update().catch(() => {});
      }
    };
    void check();
    const id = window.setInterval(check, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!release || dismissed) return null;

  const tryHostedReload = () => {
    void (async () => {
      await flushBeforeReload();
      try {
        await registrationRef.current?.update();
      } catch {
        // ignore — hard reload still helps after a Pages deploy
      }
      if (!reloadStartedRef.current) {
        reloadStartedRef.current = true;
        window.location.reload();
      }
    })();
  };

  const downloadBackup = () => {
    void exportAllData()
      .then((data) => {
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
        // Defer revocation — revoking synchronously can cancel the download in
        // some browsers before it has actually started saving the blob.
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
        recordBackup();
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : 'Could not create backup.', { tone: 'danger' });
      });
  };

  const migrateAndRelaunch = () => {
    if (migrating) return;
    setMigrating(true);
    void (async () => {
      try {
        flushPendingSave();
        const current = useStore.getState().currentResume;
        if (current) await persistResumeNow(current);
        const full = await exportAllData();
        const token =
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        let payload: unknown = slimMigrationPayload(full);
        let handoff: MigrationHandoff = {
          type: MIGRATION_HANDOFF_TYPE,
          token,
          payload,
        };
        let serialized = JSON.stringify(handoff);
        if (serialized.length > MIGRATION_HANDOFF_MAX_CHARS) {
          // Last resort: resumes + snapshots only (no sticky notes / import refs).
          payload = {
            resumes: full.resumes,
            versions: full.versions,
          };
          handoff = { type: MIGRATION_HANDOFF_TYPE, token, payload };
          serialized = JSON.stringify(handoff);
        }
        if (serialized.length > MIGRATION_HANDOFF_MAX_CHARS) {
          throw new Error(
            'Your data is too large to move in one click. Download a backup, open the online app, then use Restore backup.',
          );
        }

        window.name = serialized;
        toast('Opening the online app in this tab…', { tone: 'info', ttl: 2000 });
        window.location.assign(`${HOSTED_APP_URL}#/?migration=${encodeURIComponent(token)}`);
      } catch (err) {
        setMigrating(false);
        window.name = '';
        toast(err instanceof Error ? err.message : 'Could not prepare local data for update.', {
          tone: 'danger',
          ttl: 6000,
        });
      }
    })();
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
            {__APP_SINGLE_FILE__
              ? 'Move to the auto-updating web app in this tab with all your resumes—no file picker or separate window required.'
              : `You're on v${__APP_VERSION__}. Reload to pick up the new build, or download the offline HTML if the site is still catching up.`}
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
            {__APP_SINGLE_FILE__ ? (
              <button
                type="button"
                onClick={migrateAndRelaunch}
                disabled={migrating}
                className="btn-primary text-xs"
              >
                {migrating ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
                {migrating ? 'Moving your data…' : 'Update & relaunch'}
              </button>
            ) : (
              <button type="button" onClick={tryHostedReload} className="btn-primary text-xs">
                <Rocket size={12} />
                Reload to update
              </button>
            )}
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
