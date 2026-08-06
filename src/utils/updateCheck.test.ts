import { describe, expect, it } from 'vitest';
import { compareVersions, pickReleaseHtmlAsset } from './updateCheck';

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
