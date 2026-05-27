// Update detection for both deployment modes.
//
// Hosted (GitHub Pages with service worker):
//   The PWA plugin registers a worker that pre-caches every chunk. With
//   registerType: 'prompt' it does NOT auto-activate; instead a new worker
//   sits in 'waiting' state. We watch for that and surface a reload prompt.
//
// Single-file html (no service worker):
//   We poll the GitHub releases API on app load and once per hour. If the
//   latest release tag is newer than the bundled version, surface a prompt
//   linking to the .html asset for that release.

// Lightweight semver-ish comparator: returns positive if a > b, negative if a < b, 0 if equal.
// Accepts "v1.2.3", "1.2.3", or "1.2.3-rc.1". Pre-release tags sort BEFORE the release.
export function compareVersions(a: string, b: string): number {
  const norm = (s: string) => s.replace(/^v/, '');
  const [aMain, aPre] = norm(a).split('-');
  const [bMain, bPre] = norm(b).split('-');
  const ap = aMain.split('.').map((n) => parseInt(n, 10) || 0);
  const bp = bMain.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const diff = (ap[i] ?? 0) - (bp[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  if (aPre && bPre) return aPre.localeCompare(bPre);
  return 0;
}

export interface ReleaseInfo {
  version: string;
  htmlAssetUrl: string | null;
  releaseUrl: string;
  name: string | null;
  body: string | null;
  publishedAt: string | null;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const resp = await fetch(`https://api.github.com/repos/${__APP_REPO__}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      html_url?: string;
      published_at?: string;
      assets?: { name?: string; browser_download_url?: string }[];
    };
    if (!data.tag_name) return null;
    const htmlAsset = data.assets?.find((a) => a.name?.toLowerCase().endsWith('.html'));
    return {
      version: data.tag_name,
      htmlAssetUrl: htmlAsset?.browser_download_url ?? null,
      releaseUrl: data.html_url ?? `https://github.com/${__APP_REPO__}/releases/latest`,
      name: data.name ?? null,
      body: data.body ?? null,
      publishedAt: data.published_at ?? null,
    };
  } catch {
    return null;
  }
}

// --- Backup tracking ---------------------------------------------------------
const LAST_BACKUP_KEY = 'resume-editor:last-backup-at';
const BACKUP_NAG_DAYS = 7;

export function recordBackup(): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  } catch {
    // localStorage can throw in private mode or with quota issues — ignore.
  }
}

export function lastBackupAt(): number | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY);
    return v ? Number(v) || null : null;
  } catch {
    return null;
  }
}

export function daysSinceLastBackup(): number | null {
  const ts = lastBackupAt();
  if (!ts) return null;
  return (Date.now() - ts) / (1000 * 60 * 60 * 24);
}

export function backupIsStale(): boolean {
  const days = daysSinceLastBackup();
  // If we've never recorded one, treat as stale only after the user has done
  // some work — the caller can layer additional checks on top.
  if (days === null) return true;
  return days > BACKUP_NAG_DAYS;
}
