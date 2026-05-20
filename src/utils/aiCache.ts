import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

// Persistent cache for BYOK AI responses. Keyed by SHA-256 hash of the prompt
// + model. Survives reloads so re-clicking "Generate" with the same inputs
// doesn't burn a fresh quota call. 7-day TTL.

const CACHE_PREFIX = 'ai-cache:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedEntry {
  value: string;
  storedAt: number;
}

export async function getCached(promptHashKey: string): Promise<string | null> {
  try {
    const entry = await idbGet<CachedEntry>(CACHE_PREFIX + promptHashKey);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > TTL_MS) {
      await idbDel(CACHE_PREFIX + promptHashKey);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export async function setCached(promptHashKey: string, value: string): Promise<void> {
  try {
    await idbSet(CACHE_PREFIX + promptHashKey, { value, storedAt: Date.now() });
  } catch {
    // ignore — cache failures are non-fatal
  }
}

export async function hashKey(text: string): Promise<string> {
  if (typeof crypto?.subtle?.digest === 'function') {
    const encoder = new TextEncoder();
    const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(text));
    return Array.from(new Uint8Array(bytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for very old browsers (very unlikely)
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return String(hash);
}

export async function pruneExpired(): Promise<number> {
  let removed = 0;
  try {
    const allKeys = await idbKeys();
    for (const key of allKeys) {
      if (typeof key !== 'string' || !key.startsWith(CACHE_PREFIX)) continue;
      const entry = await idbGet<CachedEntry>(key);
      if (entry && Date.now() - entry.storedAt > TTL_MS) {
        await idbDel(key);
        removed += 1;
      }
    }
  } catch {
    // ignore
  }
  return removed;
}
