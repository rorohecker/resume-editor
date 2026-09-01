import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const svg = readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
const publicDir = path.join(root, 'public');

async function writeIcon(size, name) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(publicDir, name));
}

await writeIcon(192, 'pwa-192.png');
await writeIcon(512, 'pwa-512.png');
await writeIcon(180, 'apple-touch-icon.png');
console.log('Generated PWA icons in public/');
