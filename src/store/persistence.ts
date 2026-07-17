import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';
import type { Resume, VersionSnapshot } from '@/types';
import { normalizeResume } from '@/types/schema';
import { makeId } from '@/utils/id';
import { deleteStickyNotes, loadAllStickyNotes, copyStickyNotes } from '@/utils/stickyNotes';

// Persistence strategy: IndexedDB is the source of truth, with a synchronous
// in-memory write-through cache. Reads always hit the cache (instant, sync).
// Writes update the cache immediately and queue an IDB write asynchronously.
//
// On first load, we hydrate the cache from IDB and migrate any legacy
// localStorage data forward. Until hydration completes, callers see an empty
// store — which matches what they'd see for a fresh browser anyway, so no
// special loading state is required at the store level.

const LEGACY_KEY_RESUMES_V1 = 'resume-editor:resumes:v1';
const LEGACY_KEY_RESUMES_V2 = 'resume-editor:resumes:v2';
const RESUME_PREFIX = 'resume:';
const SNAPSHOTS_PREFIX = 'snapshots:';
const MAX_SNAPSHOTS = 20;

const cache = {
  resumes: new Map<string, Resume>(),
  snapshots: new Map<string, VersionSnapshot[]>(),
};

let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const hydrateListeners = new Set<() => void>();

// Cross-tab sync: when another tab saves a resume, deletes one, or renames,
// it posts on this channel so other open tabs can refresh their cache. This
// avoids the classic "I edited in tab A, tab B overwrote with stale data"
// data-loss footgun.
type ChannelMessage =
  | { type: 'resume:save'; resume: Resume }
  | { type: 'resume:delete'; id: string }
  | { type: 'snapshots:save'; resumeId: string; snapshots: VersionSnapshot[] };

const channel: BroadcastChannel | null =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('resume-editor');
const remoteUpdateListeners = new Set<(message: ChannelMessage) => void>();

export function onRemoteUpdate(listener: (message: ChannelMessage) => void): () => void {
  remoteUpdateListeners.add(listener);
  return () => {
    remoteUpdateListeners.delete(listener);
  };
}

if (channel) {
  channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
    const message = event.data;
    if (!message) return;
    if (message.type === 'resume:save') {
      cache.resumes.set(message.resume.id, message.resume);
    } else if (message.type === 'resume:delete') {
      cache.resumes.delete(message.id);
      cache.snapshots.delete(message.id);
    } else if (message.type === 'snapshots:save') {
      cache.snapshots.set(message.resumeId, message.snapshots);
    }
    for (const listener of remoteUpdateListeners) listener(message);
  };
}

function broadcast(message: ChannelMessage): void {
  try {
    channel?.postMessage(message);
  } catch {
    // Some browsers fail to clone non-serializable values; cross-tab sync is a
    // nice-to-have, not a requirement.
  }
}

export function onHydrated(listener: () => void): () => void {
  if (hydrated) {
    listener();
    return () => {};
  }
  hydrateListeners.add(listener);
  return () => hydrateListeners.delete(listener);
}

export function isHydrated(): boolean {
  return hydrated;
}

export function hydratePersistence(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      // Pull any legacy localStorage payloads forward into IDB before reading.
      await migrateLegacyLocalStorage();

      const allKeys = await idbKeys();
      for (const key of allKeys) {
        if (typeof key !== 'string') continue;
        if (key.startsWith(RESUME_PREFIX)) {
          const value = await idbGet<Resume>(key);
          const normalized = value ? normalizeResume(value) : null;
          if (normalized) cache.resumes.set(normalized.id, normalized);
        } else if (key.startsWith(SNAPSHOTS_PREFIX)) {
          const id = key.slice(SNAPSHOTS_PREFIX.length);
          const value = await idbGet<unknown>(key);
          const snapshots = await maybeDecompressSnapshots(value);
          if (snapshots.length > 0) {
            cache.snapshots.set(
              id,
              snapshots
                .map((snapshot) => normalizeSnapshot(snapshot, id))
                .filter((snapshot): snapshot is VersionSnapshot => Boolean(snapshot)),
            );
          }
        }
      }
    } catch (err) {
      console.warn('IndexedDB hydration failed; continuing with empty cache.', err);
    } finally {
      hydrated = true;
      for (const listener of hydrateListeners) listener();
      hydrateListeners.clear();
    }
  })();
  return hydratePromise;
}

async function migrateLegacyLocalStorage(): Promise<void> {
  try {
    const raw =
      localStorage.getItem(LEGACY_KEY_RESUMES_V2) ?? localStorage.getItem(LEGACY_KEY_RESUMES_V1);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<{
      resumes: Record<string, Resume>;
      versions: Record<string, VersionSnapshot[]>;
    }>;

    if (parsed.resumes) {
      for (const [id, resume] of Object.entries(parsed.resumes)) {
        const normalized = normalizeResume(resume);
        if (normalized) await idbSet(RESUME_PREFIX + id, normalized);
      }
    }
    if (parsed.versions) {
      for (const [id, snapshots] of Object.entries(parsed.versions)) {
        if (Array.isArray(snapshots)) await idbSet(SNAPSHOTS_PREFIX + id, snapshots);
      }
    }

    localStorage.removeItem(LEGACY_KEY_RESUMES_V2);
    localStorage.removeItem(LEGACY_KEY_RESUMES_V1);
  } catch (err) {
    console.warn('Legacy localStorage migration failed; continuing.', err);
  }
}

// Fire-and-forget IDB write helper. Failures (e.g. quota exceeded) notify
// listeners so the UI can show a sticky error; in-memory cache stays consistent.
const persistErrorListeners = new Set<(error: Error) => void>();
const persistOkListeners = new Set<() => void>();

export function onPersistError(listener: (error: Error) => void): () => void {
  persistErrorListeners.add(listener);
  return () => persistErrorListeners.delete(listener);
}

export function onPersistOk(listener: () => void): () => void {
  persistOkListeners.add(listener);
  return () => persistOkListeners.delete(listener);
}

function notifyPersistError(err: unknown, key: string): void {
  const error =
    err instanceof Error ? err : new Error(`Failed to persist ${key}`);
  console.warn(`Failed to persist ${key}`, err);
  for (const listener of persistErrorListeners) listener(error);
}

function notifyPersistOk(): void {
  for (const listener of persistOkListeners) listener();
}

function queueWrite(key: string, value: unknown): void {
  void idbSet(key, value)
    .then(() => notifyPersistOk())
    .catch((err) => notifyPersistError(err, key));
}

function queueDelete(key: string): void {
  void idbDel(key)
    .then(() => notifyPersistOk())
    .catch((err) => notifyPersistError(err, key));
}

export function saveResume(resume: Resume): void {
  const normalized = normalizeResume(resume);
  if (!normalized) return;
  cache.resumes.set(normalized.id, normalized);
  queueWrite(RESUME_PREFIX + normalized.id, normalized);
  broadcast({ type: 'resume:save', resume: normalized });
}

// In-app writes (already valid). Skip normalization for speed.
export function saveResumeFast(resume: Resume): void {
  cache.resumes.set(resume.id, resume);
  queueWrite(RESUME_PREFIX + resume.id, resume);
  broadcast({ type: 'resume:save', resume });
}

export function loadResume(id: string): Resume | null {
  return cache.resumes.get(id) ?? null;
}

export function listResumes(): Resume[] {
  return Array.from(cache.resumes.values()).sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export function deleteResume(id: string): void {
  cache.resumes.delete(id);
  cache.snapshots.delete(id);
  queueDelete(RESUME_PREFIX + id);
  queueDelete(SNAPSHOTS_PREFIX + id);
  deleteStickyNotes(id);
  broadcast({ type: 'resume:delete', id });
}

export function renameResume(id: string, name: string): Resume | null {
  const resume = cache.resumes.get(id);
  if (!resume) return null;
  const next = { ...resume, name, updatedAt: new Date().toISOString() };
  cache.resumes.set(id, next);
  queueWrite(RESUME_PREFIX + id, next);
  broadcast({ type: 'resume:save', resume: next });
  return next;
}

export function duplicateResume(id: string): Resume | null {
  const resume = cache.resumes.get(id);
  if (!resume) return null;
  const now = new Date().toISOString();
  const duplicate = {
    ...structuredClone(resume),
    id: makeId(),
    name: `${resume.name} Copy`,
    createdAt: now,
    updatedAt: now,
  };
  cache.resumes.set(duplicate.id, duplicate);
  queueWrite(RESUME_PREFIX + duplicate.id, duplicate);
  broadcast({ type: 'resume:save', resume: duplicate });
  void copyStickyNotes(id, duplicate.id).catch((err) => {
    console.warn('Failed to copy sticky notes for duplicate', err);
  });
  return duplicate;
}

export async function exportAllData(): Promise<{
  resumes: Record<string, Resume>;
  versions: Record<string, VersionSnapshot[]>;
  stickyNotes: Record<string, import('@/utils/stickyNotes').StickyNote[]>;
}> {
  return {
    resumes: Object.fromEntries(cache.resumes),
    versions: Object.fromEntries(cache.snapshots),
    stickyNotes: await loadAllStickyNotes(),
  };
}

export function importResumeData(resume: Resume): Resume {
  const now = new Date().toISOString();
  const next = normalizeResume({
    ...resume,
    id: resume.id || makeId(),
    createdAt: resume.createdAt || now,
    updatedAt: now,
  });
  if (!next) throw new Error('Invalid resume data.');
  saveResume(next);
  return next;
}

export function createVersionSnapshot(resume: Resume, name?: string): VersionSnapshot {
  const snapshot: VersionSnapshot = {
    id: makeId(),
    resumeId: resume.id,
    name: name?.trim() || `Snapshot ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    resume: structuredClone(resume),
  };
  const current = cache.snapshots.get(resume.id) ?? [];
  const next = [snapshot, ...current].slice(0, MAX_SNAPSHOTS);
  cache.snapshots.set(resume.id, next);
  // Snapshots are the largest blob class — gzip them before write when the
  // browser supports CompressionStream. Reads transparently inflate.
  void writeSnapshotsCompressed(resume.id, next);
  return snapshot;
}

async function writeSnapshotsCompressed(resumeId: string, snapshots: VersionSnapshot[]): Promise<void> {
  const key = SNAPSHOTS_PREFIX + resumeId;
  broadcast({ type: 'snapshots:save', resumeId, snapshots });
  try {
    if (typeof CompressionStream === 'undefined') {
      await idbSet(key, snapshots);
      notifyPersistOk();
      return;
    }
    const json = JSON.stringify(snapshots);
    const blob = new Blob([json], { type: 'application/json' });
    const compressed = new Response(blob.stream().pipeThrough(new CompressionStream('gzip')));
    const buffer = await compressed.arrayBuffer();
    await idbSet(key, { __gzip: true, data: buffer });
    notifyPersistOk();
  } catch (err) {
    console.warn('snapshot compression failed; storing raw', err);
    try {
      await idbSet(key, snapshots);
      notifyPersistOk();
    } catch (rawErr) {
      notifyPersistError(rawErr, key);
    }
  }
}

async function maybeDecompressSnapshots(value: unknown): Promise<VersionSnapshot[]> {
  if (
    value &&
    typeof value === 'object' &&
    (value as { __gzip?: boolean }).__gzip &&
    (value as { data?: ArrayBuffer }).data instanceof ArrayBuffer
  ) {
    try {
      const decompressed = new Response(
        new Blob([(value as { data: ArrayBuffer }).data]).stream().pipeThrough(new DecompressionStream('gzip')),
      );
      const text = await decompressed.text();
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? (value as VersionSnapshot[]) : [];
}

export function listVersionSnapshots(resumeId: string): VersionSnapshot[] {
  return cache.snapshots.get(resumeId) ?? [];
}

export function deleteVersionSnapshot(resumeId: string, snapshotId: string): void {
  const current = cache.snapshots.get(resumeId) ?? [];
  const next = current.filter((snapshot) => snapshot.id !== snapshotId);
  cache.snapshots.set(resumeId, next);
  void writeSnapshotsCompressed(resumeId, next);
}

function normalizeSnapshot(input: unknown, resumeId: string): VersionSnapshot | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Partial<VersionSnapshot>;
  const resume = normalizeResume(raw.resume);
  if (!resume) return null;
  return {
    id: typeof raw.id === 'string' ? raw.id : makeId(),
    resumeId: typeof raw.resumeId === 'string' ? raw.resumeId : resumeId,
    name: typeof raw.name === 'string' ? raw.name : 'Snapshot',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    resume,
  };
}
