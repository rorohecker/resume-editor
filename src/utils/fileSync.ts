// File System Access integration for auto-saving the IndexedDB dump to a
// user-chosen JSON file. Chromium-only (Chrome/Edge desktop) — Firefox and
// Safari simply don't expose showSaveFilePicker, and the UI gracefully
// degrades to the one-shot download.
//
// The picked FileSystemFileHandle is persisted in IndexedDB (via idb-keyval
// alongside the resume cache) so reloads can resume auto-save without asking
// the user to pick again. Browsers re-prompt for permission on a fresh page
// load, but a single click is enough to renew it.

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

const HANDLE_KEY = 'resume-editor:file-sync-handle';

export type FileSyncStatus =
  | { kind: 'unsupported' }
  | { kind: 'inactive' }
  | { kind: 'needs-permission'; name: string }
  | { kind: 'active'; name: string };

export interface FileSync {
  status: FileSyncStatus;
  // True if showSaveFilePicker is callable in this browser.
  supported: boolean;
}

export function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'showSaveFilePicker' in window &&
    typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'
  );
}

interface ShowSaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

interface ShowOpenFilePickerOptions {
  multiple?: boolean;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: ShowSaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    showOpenFilePicker?: (options?: ShowOpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
  }
}

// Pick an existing html file and overwrite it with the given content. Used by
// the UpdateBanner's "Replace existing file" flow so users can update their
// single-file resume-editor in place instead of downloading a second copy.
export async function replaceExistingHtmlFile(content: ArrayBuffer | Blob): Promise<{
  ok: boolean;
  filename?: string;
  error?: string;
}> {
  if (!isFileSystemAccessSupported() || !window.showOpenFilePicker) {
    return {
      ok: false,
      error: 'Your browser does not support replacing files in place. Use the Download button instead and overwrite the file yourself (Chrome and Edge support in-place replacement).',
    };
  }
  let handle: FileSystemFileHandle;
  try {
    const handles = await window.showOpenFilePicker({
      types: [
        {
          description: 'Resume Editor html',
          accept: { 'text/html': ['.html', '.htm'] },
        },
      ],
    });
    handle = handles[0];
    if (!handle) return { ok: false };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { ok: false };
    return { ok: false, error: err instanceof Error ? err.message : 'Could not open file picker.' };
  }
  const granted = await ensureWritePermission(handle);
  if (!granted) {
    return { ok: false, error: 'Write permission was denied for that file.' };
  }
  try {
    const writable = await handle.createWritable();
    try {
      await writable.write(content);
    } finally {
      await writable.close();
    }
    return { ok: true, filename: handle.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Write failed.' };
  }
}

export async function loadPersistedHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const handle = (await idbGet(HANDLE_KEY)) as FileSystemFileHandle | undefined;
    return handle ?? null;
  } catch {
    return null;
  }
}

export async function persistHandle(handle: FileSystemFileHandle): Promise<void> {
  try {
    await idbSet(HANDLE_KEY, handle);
  } catch {
    // Persistent storage may fail in private mode; user just re-picks next time.
  }
}

export async function clearPersistedHandle(): Promise<void> {
  try {
    await idbDel(HANDLE_KEY);
  } catch {
    // ignore
  }
}

export async function pickFileForSync(): Promise<FileSystemFileHandle | null> {
  if (!isFileSystemAccessSupported() || !window.showSaveFilePicker) return null;
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: `resume-editor-${new Date().toISOString().slice(0, 10)}.json`,
      types: [
        {
          description: 'Resume Editor backup',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });
    await persistHandle(handle);
    return handle;
  } catch (err) {
    // User cancelled the picker — not an error worth surfacing.
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    return null;
  }
}

// Verify or request read-write permission on a handle. Returns true if granted.
export async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  type Permissionable = FileSystemFileHandle & {
    queryPermission?: (opts: { mode: 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (opts: { mode: 'readwrite' }) => Promise<PermissionState>;
  };
  const ph = handle as Permissionable;
  const opts = { mode: 'readwrite' as const };
  try {
    if (ph.queryPermission) {
      const state = await ph.queryPermission(opts);
      if (state === 'granted') return true;
    }
    if (ph.requestPermission) {
      const state = await ph.requestPermission(opts);
      return state === 'granted';
    }
  } catch {
    return false;
  }
  return false;
}

export async function writeJsonToHandle(
  handle: FileSystemFileHandle,
  data: unknown,
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(data, null, 2));
  } finally {
    await writable.close();
  }
}
