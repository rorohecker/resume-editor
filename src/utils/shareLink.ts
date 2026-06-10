import type { Resume } from '@/types';
import { normalizeResume } from '@/types/schema';

// Encodes a whole resume into a URL-safe string so it can travel inside a
// shareable link (no server, no account). The resume is JSON-stringified, gzip
// compressed when the browser supports CompressionStream, then base64url
// encoded. Decoding reverses the process and re-validates via normalizeResume.

const GZIP_MARKER = 'g';
const RAW_MARKER = 'r';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encodeResumeToToken(resume: Resume): Promise<string> {
  const json = JSON.stringify(stripForShare(resume));
  const input = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'));
      const buffer = await new Response(stream).arrayBuffer();
      return GZIP_MARKER + bytesToBase64Url(new Uint8Array(buffer));
    } catch {
      // fall through to raw encoding
    }
  }
  return RAW_MARKER + bytesToBase64Url(input);
}

export async function decodeResumeFromToken(token: string): Promise<Resume | null> {
  try {
    const marker = token[0];
    const body = token.slice(1);
    const bytes = base64UrlToBytes(body);
    let json: string;
    if (marker === GZIP_MARKER && typeof DecompressionStream !== 'undefined') {
      const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
      json = await new Response(stream).text();
    } else {
      json = new TextDecoder().decode(bytes);
    }
    return normalizeResume(JSON.parse(json));
  } catch {
    return null;
  }
}

// Builds the full shareable URL pointing at the read-only #/view route, keeping
// whatever origin/path the app is currently served from (works on a hosted
// site; file:// links only resolve on the same machine, which we warn about).
export async function buildShareUrl(resume: Resume): Promise<string> {
  const token = await encodeResumeToToken(resume);
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/view?d=${token}`;
}

// Drop volatile/identifying bookkeeping that a recipient doesn't need.
function stripForShare(resume: Resume): Resume {
  return { ...resume, application: undefined };
}
