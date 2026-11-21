import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compareVersions,
  fetchLatestRelease,
  HOSTED_VERSION_URL,
  isNewerRelease,
  pickReleaseHtmlAsset,
  releaseFromVersionPayload,
} from './updateCheck';

describe('compareVersions', () => {
  it('orders plain semver', () => {
    expect(compareVersions('v0.2.58', 'v0.2.57')).toBeGreaterThan(0);
    expect(compareVersions('0.2.57', 'v0.2.58')).toBeLessThan(0);
    expect(compareVersions('v0.2.58', '0.2.58')).toBe(0);
  });

  it('sorts pre-releases before the matching release', () => {
    expect(compareVersions('v1.0.0-rc.1', 'v1.0.0')).toBeLessThan(0);
    expect(compareVersions('v1.0.0', 'v1.0.0-rc.1')).toBeGreaterThan(0);
  });

  it('detects 0.2.64 as newer than 0.2.61', () => {
    expect(isNewerRelease('v0.2.64', '0.2.61')).toBe(true);
    expect(isNewerRelease('v0.2.61', '0.2.61')).toBe(false);
  });
});

describe('pickReleaseHtmlAsset', () => {
  it('prefers the resume-editor html asset over other html files', () => {
    const url = pickReleaseHtmlAsset('v0.2.58', [
      { name: 'notes.html', browser_download_url: 'https://example.com/notes.html' },
      {
        name: 'resume-editor-v0.2.58.html',
        browser_download_url: 'https://example.com/resume-editor-v0.2.58.html',
      },
    ]);
    expect(url).toContain('resume-editor-v0.2.58.html');
  });

  it('falls back to any html asset', () => {
    const url = pickReleaseHtmlAsset('v0.2.58', [
      { name: 'app.html', browser_download_url: 'https://example.com/app.html' },
    ]);
    expect(url).toBe('https://example.com/app.html');
  });

  it('returns null when no html assets exist', () => {
    expect(pickReleaseHtmlAsset('v0.2.58', [{ name: 'README.md' }])).toBeNull();
  });
});

describe('releaseFromVersionPayload', () => {
  it('accepts Pages version.json shape', () => {
    const info = releaseFromVersionPayload({
      version: '0.2.65',
      tag: 'v0.2.65',
      name: 'v0.2.65',
      htmlAssetUrl: 'https://rorohecker.github.io/resume-editor/single.html',
      releaseUrl: 'https://github.com/rorohecker/resume-editor/releases/tag/v0.2.65',
      body: null,
      publishedAt: '2026-11-21T00:00:00.000Z',
    });
    expect(info?.version).toBe('v0.2.65');
    expect(info?.htmlAssetUrl).toContain('single.html');
  });
});

describe('fetchLatestRelease', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prefers Pages version.json and does not send custom headers', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.headers).toBeUndefined();
      if (url.startsWith(HOSTED_VERSION_URL)) {
        return {
          ok: true,
          json: async () => ({
            version: '0.2.65',
            tag: 'v0.2.65',
            name: 'v0.2.65: update check fix',
            htmlAssetUrl: 'https://rorohecker.github.io/resume-editor/single.html',
            releaseUrl: 'https://github.com/rorohecker/resume-editor/releases/tag/v0.2.65',
            body: 'Fixed update detection',
            publishedAt: '2026-11-21T00:00:00.000Z',
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const latest = await fetchLatestRelease();
    expect(latest?.version).toBe('v0.2.65');
    expect(latest?.body).toContain('Fixed update detection');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to GitHub releases when Pages version.json is unavailable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.headers).toBeUndefined();
      if (url.startsWith(HOSTED_VERSION_URL)) {
        return { ok: false, json: async () => ({}) };
      }
      if (url.includes('/repos/rorohecker/resume-editor/releases/latest')) {
        return {
          ok: true,
          json: async () => ({
            tag_name: 'v0.2.64',
            name: 'v0.2.64',
            body: 'Prior release',
            html_url: 'https://github.com/rorohecker/resume-editor/releases/tag/v0.2.64',
            published_at: '2026-11-21T17:43:59Z',
            assets: [
              {
                name: 'resume-editor-v0.2.64.html',
                browser_download_url:
                  'https://github.com/rorohecker/resume-editor/releases/download/v0.2.64/resume-editor-v0.2.64.html',
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const latest = await fetchLatestRelease();
    expect(latest?.version).toBe('v0.2.64');
    expect(latest?.htmlAssetUrl).toContain('resume-editor-v0.2.64.html');
  });
});
