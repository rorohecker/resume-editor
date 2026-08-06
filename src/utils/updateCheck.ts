// Update detection for both deployment modes.
//
// Hosted (GitHub Pages with service worker):
//   registerType: 'autoUpdate' activates new workers and the app reloads after
//   flushing pending edits (see UpdateBanner).
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
  if (aPre && bPre) {
    const aParts = aPre.split('.');
    const bParts = bPre.split('.');
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aSeg = aParts[i] ?? '';
      const bSeg = bParts[i] ?? '';
      const aNum = Number.parseInt(aSeg, 10);
      const bNum = Number.parseInt(bSeg, 10);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && String(aNum) === aSeg && String(bNum) === bSeg) {
        if (aNum !== bNum) return aNum - bNum;
        continue;
      }
      const cmp = aSeg.localeCompare(bSeg);
      if (cmp !== 0) return cmp;
    }
    return 0;
  }
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

type GhAsset = { name?: string; browser_download_url?: string };

/** Prefer resume-editor-vX.Y.Z.html, then any .html asset. */
export function pickReleaseHtmlAsset(
  tagName: string,
  assets: GhAsset[] | undefined,
): string | null {
  if (!assets?.length) return null;
  const htmlAssets = assets.filter((a) => a.name?.toLowerCase().endsWith('.html') && a.browser_download_url);
  if (htmlAssets.length === 0) return null;
  const version = tagName.replace(/^v/, '');
  const preferred =
    htmlAssets.find((a) => a.name?.toLowerCase() === `resume-editor-v${version}.html`) ||
    htmlAssets.find((a) => a.name?.toLowerCase().startsWith('resume-editor') && a.name.toLowerCase().endsWith('.html')) ||
    htmlAssets[0];
  return preferred?.browser_download_url ?? null;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    // Cache-bust so long-lived tabs don't keep a stale "latest" after a release.
    const resp = await fetch(
      `https://api.github.com/repos/${__APP_REPO__}/releases/latest?_=${Date.now()}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'Cache-Control': 'no-cache',
        },
      },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      html_url?: string;
      published_at?: string;
      assets?: GhAsset[];
    };
    if (!data.tag_name) return null;
    return {
      version: data.tag_name,
      htmlAssetUrl: pickReleaseHtmlAsset(data.tag_name, data.assets),
      releaseUrl: data.html_url ?? `https://github.com/${__APP_REPO__}/releases/latest`,
      name: data.name ?? null,
      body: data.body ?? null,
      publishedAt: data.published_at ?? null,
    };
  } catch {
    return null;
  }
}

/** True when GitHub's latest release is newer than this build. */
export function isNewerRelease(latestTag: string, currentVersion = __APP_VERSION__): boolean {
  return compareVersions(latestTag, `v${currentVersion}`) > 0;
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
