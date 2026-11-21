#!/usr/bin/env node
// Writes public/version.json so GitHub Pages (and local preview) expose the
// current build version without hitting the GitHub API. The in-app updater
// prefers this file because it needs no custom headers (CORS-safe from
// file://) and is not rate-limited.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();
if (!version) {
  console.error('package.json is missing a version');
  process.exit(1);
}

const payload = {
  version,
  tag: `v${version}`,
  name: `v${version}`,
  htmlAssetUrl: 'https://rorohecker.github.io/resume-editor/single.html',
  releaseUrl: `https://github.com/rorohecker/resume-editor/releases/tag/v${version}`,
  body: null,
  publishedAt: new Date().toISOString(),
};

const outDir = path.join(root, 'public');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'version.json');
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, outPath)} (${payload.tag})`);
