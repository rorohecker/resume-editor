// Update detection for both deployment modes.
//
// Hosted (GitHub Pages with service worker):
//   registerType: 'autoUpdate' activates new workers and the app reloads after
//   flushing pending edits (see UpdateBanner).
//
// Single-file html (no service worker):
//   We poll a Pages-hosted version.json (preferred) and fall back to the
//   GitHub releases API. If the latest version is newer than the bundled
//   build, surface a prompt linking to the .html asset for that release.
//
// Important: never send non-CORS-safelisted request headers (e.g. Cache-Control).
// Those trigger a preflight that GitHub rejects, and older builds (≤0.2.61)
// failed the update check silently because of that.

/** Always-latest version metadata on GitHub Pages (CORS:*). */
export const HOSTED_VERSION_URL =
  'https://rorohecker.github.io/resume-editor/version.json';

/** Always-latest single-file build on GitHub Pages (CORS:*). */
export const HOSTED_SINGLE_FILE_URL =
  'https://rorohecker.github.io/resume-editor/single.html';

/** Dispatched on window when the user clicks the version badge. */
export const CHECK_UPDATES_EVENT = 'resume-editor:check-updates';

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

/** Cache-bust with a query param. Never set custom headers (avoids CORS preflight). */
async function fetchJson(url: string): Promise<unknown | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const joiner = url.includes('?') ? '&' : '?';
    const resp = await fetch(`${url}${joiner}_=${Date.now()}`);
    if (!resp.ok) return null;
    return (await resp.json()) as unknown;
  } catch {
    return null;
  }
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Normalize Pages version.json (or a hand-written equivalent). */
export function releaseFromVersionPayload(data: unknown): ReleaseInfo | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const version =
    asNonEmptyString(record.tag) ||
    asNonEmptyString(record.version) ||
    asNonEmptyString(record.tag_name);
  if (!version) return null;
  const tag = version.startsWith('v') ? version : `v${version}`;
  return {
    version: tag,
    htmlAssetUrl: asNonEmptyString(record.htmlAssetUrl) || HOSTED_SINGLE_FILE_URL,
    releaseUrl:
      asNonEmptyString(record.releaseUrl) ||
      asNonEmptyString(record.html_url) ||
      `https://github.com/${__APP_REPO__}/releases/tag/${tag}`,
    name: asNonEmptyString(record.name),
    body: asNonEmptyString(record.body),
    publishedAt: asNonEmptyString(record.publishedAt) || asNonEmptyString(record.published_at),
  };
}

function releaseFromGitHubPayload(data: unknown): ReleaseInfo | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as {
    tag_name?: string;
    name?: string;
    body?: string;
    html_url?: string;
    published_at?: string;
    assets?: GhAsset[];
  };
  if (!record.tag_name) return null;
  return {
    version: record.tag_name,
    htmlAssetUrl: pickReleaseHtmlAsset(record.tag_name, record.assets) || HOSTED_SINGLE_FILE_URL,
    releaseUrl: record.html_url ?? `https://github.com/${__APP_REPO__}/releases/latest`,
    name: record.name ?? null,
    body: record.body ?? null,
    publishedAt: record.published_at ?? null,
  };
}

async function fetchGitHubLatestRelease(): Promise<ReleaseInfo | null> {
  const data = await fetchJson(
    `https://api.github.com/repos/${__APP_REPO__}/releases/latest`,
  );
  return releaseFromGitHubPayload(data);
}

/**
 * Prefer Pages version.json (no rate limit, CORS-safe), then GitHub releases.
 * When Pages has a newer build but no release notes, enrich from GitHub.
 */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const pagesRaw = await fetchJson(HOSTED_VERSION_URL);
  const pages = releaseFromVersionPayload(pagesRaw);
  if (pages) {
    if (pages.body) return pages;
    // Best-effort notes / named .html asset from the matching GitHub release.
    const gh = await fetchGitHubLatestRelease();
    if (gh && compareVersions(gh.version, pages.version) === 0) {
      return {
        ...pages,
        name: gh.name || pages.name,
        body: gh.body,
        htmlAssetUrl: gh.htmlAssetUrl || pages.htmlAssetUrl,
        releaseUrl: gh.releaseUrl || pages.releaseUrl,
        publishedAt: gh.publishedAt || pages.publishedAt,
      };
    }
    // If GitHub is ahead of a stale Pages file, trust GitHub.
    if (gh && compareVersions(gh.version, pages.version) > 0) return gh;
    return pages;
  }
  return fetchGitHubLatestRelease();
}

/** True when GitHub's latest release is newer than this build. */
export function isNewerRelease(latestTag: string, currentVersion = __APP_VERSION__): boolean {
  return compareVersions(latestTag, `v${currentVersion}`) > 0;
}

export function requestUpdateCheck(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHECK_UPDATES_EVENT));
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
