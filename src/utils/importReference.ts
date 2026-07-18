import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

// When a resume is imported (from a PDF/DOCX/pasted text), we stash the raw
// source text alongside the resume so the user can keep it open beside the
// editor and copy/paste from it while rebuilding their resume. Like sticky
// notes, this lives OUTSIDE the Resume document (its own IDB key per resume)
// so it never leaks into exports, share links, PDF/DOCX output, or snapshots.
// For PDF/DOCX uploads we also keep the original file bytes (base64) so the
// sidebar can show the real document, not just re-parsed text.

const IMPORT_REFERENCE_PREFIX = 'import-reference:';
const MAX_ORIGINAL_BYTES = 12 * 1024 * 1024;

export interface ImportOriginalFile {
  /** Base64 payload (no data: URL prefix) so backups stay JSON-safe. */
  base64: string;
  mime: string;
  name?: string;
}

export interface ImportReference {
  text: string;
  sourceName?: string;
  importedAt: string;
  original?: ImportOriginalFile;
}

export type ImportReferenceMeta = {
  sourceText: string;
  sourceName?: string;
  original?: ImportOriginalFile;
};

function toError(err: unknown, fallback: string): Error {
  return err instanceof Error ? err : new Error(fallback);
}

function normalizeOriginal(input: unknown): ImportOriginalFile | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Partial<ImportOriginalFile>;
  if (typeof raw.base64 !== 'string' || !raw.base64.trim()) return undefined;
  if (typeof raw.mime !== 'string' || !raw.mime.trim()) return undefined;
  return {
    base64: raw.base64,
    mime: raw.mime,
    name: typeof raw.name === 'string' ? raw.name : undefined,
  };
}

function normalizeReference(input: unknown): ImportReference | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<ImportReference>;
  if (typeof raw.text !== 'string' || !raw.text.trim()) return null;
  return {
    text: raw.text,
    sourceName: typeof raw.sourceName === 'string' ? raw.sourceName : undefined,
    importedAt: typeof raw.importedAt === 'string' ? raw.importedAt : new Date().toISOString(),
    original: normalizeOriginal(raw.original),
  };
}

export function isPreviewableOriginal(original?: ImportOriginalFile | null): boolean {
  if (!original) return false;
  const mime = original.mime.toLowerCase();
  const name = (original.name ?? '').toLowerCase();
  return (
    mime.includes('pdf') ||
    name.endsWith('.pdf') ||
    mime.includes('wordprocessingml') ||
    name.endsWith('.docx')
  );
}

export function originalToBlob(original: ImportOriginalFile): Blob {
  const binary = atob(original.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: original.mime || 'application/octet-stream' });
}

export async function captureImportOriginal(file: File): Promise<ImportOriginalFile | undefined> {
  const name = file.name;
  const mime = file.type || guessMime(name);
  const probe: ImportOriginalFile = { base64: '', mime, name };
  if (!isPreviewableOriginal(probe)) return undefined;
  if (file.size > MAX_ORIGINAL_BYTES) {
    console.warn(
      `Skipping original-file preview storage; file is ${(file.size / (1024 * 1024)).toFixed(1)} MB (cap ${MAX_ORIGINAL_BYTES / (1024 * 1024)} MB).`,
    );
    return undefined;
  }
  try {
    const base64 = await fileToBase64(file);
    return { base64, mime, name };
  } catch (err) {
    console.warn('Failed to capture original import file for preview', err);
    return undefined;
  }
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.doc')) return 'application/msword';
  return 'application/octet-stream';
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function loadImportReference(
  resumeId: string,
): Promise<{ reference: ImportReference | null; error?: Error }> {
  try {
    const value = await idbGet<unknown>(IMPORT_REFERENCE_PREFIX + resumeId);
    if (value == null) return { reference: null };
    const reference = normalizeReference(value);
    if (!reference) {
      return {
        reference: null,
        error: new Error('Imported resume reference was corrupted in browser storage.'),
      };
    }
    return { reference };
  } catch (err) {
    return { reference: null, error: toError(err, 'Failed to load imported source text') };
  }
}

export async function saveImportReference(
  resumeId: string,
  text: string,
  sourceName?: string,
  original?: ImportOriginalFile,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const reference: ImportReference = {
    text,
    sourceName,
    importedAt: new Date().toISOString(),
    original: original && isPreviewableOriginal(original) ? original : undefined,
  };
  try {
    await idbSet(IMPORT_REFERENCE_PREFIX + resumeId, reference);
  } catch (err) {
    // Large PDF/DOCX originals can blow past IndexedDB quota — keep the text.
    if (reference.original) {
      try {
        const { original: _drop, ...textOnly } = reference;
        await idbSet(IMPORT_REFERENCE_PREFIX + resumeId, textOnly);
        console.warn('Saved import text without original file (storage quota).', err);
        return;
      } catch {
        // fall through
      }
    }
    console.warn('Failed to persist imported source text', err);
    throw toError(err, 'Failed to save imported source text');
  }
}

// Merge imports keep any previously stored source and append the new one so a
// user who imports twice into the same resume can still see both originals.
// When a new PDF/DOCX is provided, it becomes the previewed original.
export async function appendImportReference(
  resumeId: string,
  text: string,
  sourceName?: string,
  original?: ImportOriginalFile,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const { reference, error } = await loadImportReference(resumeId);
  if (error) throw error;
  if (!reference) {
    await saveImportReference(resumeId, text, sourceName, original);
    return;
  }
  const label = sourceName?.trim() || 'Additional import';
  const divider = `\n\n${'─'.repeat(24)}\n${label}\n${'─'.repeat(24)}\n\n`;
  const combinedName = [reference.sourceName, sourceName].filter(Boolean).join(' + ') || undefined;
  await saveImportReference(
    resumeId,
    `${reference.text}${divider}${text}`,
    combinedName,
    original ?? reference.original,
  );
}

export function deleteImportReference(resumeId: string): void {
  void idbDel(IMPORT_REFERENCE_PREFIX + resumeId).catch((err) => {
    console.warn('Failed to delete imported source text', err);
  });
}

export async function loadAllImportReferences(): Promise<Record<string, ImportReference>> {
  const references: Record<string, ImportReference> = {};
  try {
    const allKeys = await idbKeys();
    for (const key of allKeys) {
      if (typeof key !== 'string' || !key.startsWith(IMPORT_REFERENCE_PREFIX)) continue;
      const resumeId = key.slice(IMPORT_REFERENCE_PREFIX.length);
      const { reference, error } = await loadImportReference(resumeId);
      if (!error && reference) references[resumeId] = reference;
    }
  } catch (err) {
    console.warn('Failed to enumerate imported resume references for backup', err);
  }
  return references;
}

export async function copyImportReference(fromResumeId: string, toResumeId: string): Promise<void> {
  const { reference, error } = await loadImportReference(fromResumeId);
  if (error || !reference) return;
  await saveImportReference(toResumeId, reference.text, reference.sourceName, reference.original);
}
