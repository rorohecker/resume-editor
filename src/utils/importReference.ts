import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

// When a resume is imported (from a PDF/DOCX/pasted text), we stash the raw
// source text alongside the resume so the user can keep it open beside the
// editor and copy/paste from it while rebuilding their resume. Like sticky
// notes, this lives OUTSIDE the Resume document (its own IDB key per resume)
// so it never leaks into exports, share links, PDF/DOCX output, or snapshots.

const IMPORT_REFERENCE_PREFIX = 'import-reference:';

export interface ImportReference {
  text: string;
  sourceName?: string;
  importedAt: string;
}

function toError(err: unknown, fallback: string): Error {
  return err instanceof Error ? err : new Error(fallback);
}

function normalizeReference(input: unknown): ImportReference | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<ImportReference>;
  if (typeof raw.text !== 'string' || !raw.text.trim()) return null;
  return {
    text: raw.text,
    sourceName: typeof raw.sourceName === 'string' ? raw.sourceName : undefined,
    importedAt: typeof raw.importedAt === 'string' ? raw.importedAt : new Date().toISOString(),
  };
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
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  try {
    const reference: ImportReference = {
      text,
      sourceName,
      importedAt: new Date().toISOString(),
    };
    await idbSet(IMPORT_REFERENCE_PREFIX + resumeId, reference);
  } catch (err) {
    console.warn('Failed to persist imported source text', err);
    throw toError(err, 'Failed to save imported source text');
  }
}

// Merge imports keep any previously stored source and append the new one so a
// user who imports twice into the same resume can still see both originals.
export async function appendImportReference(
  resumeId: string,
  text: string,
  sourceName?: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const { reference, error } = await loadImportReference(resumeId);
  if (error) throw error;
  if (!reference) {
    await saveImportReference(resumeId, text, sourceName);
    return;
  }
  const label = sourceName?.trim() || 'Additional import';
  const divider = `\n\n${'─'.repeat(24)}\n${label}\n${'─'.repeat(24)}\n\n`;
  const combinedName = [reference.sourceName, sourceName].filter(Boolean).join(' + ') || undefined;
  await saveImportReference(resumeId, `${reference.text}${divider}${text}`, combinedName);
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
  await saveImportReference(toResumeId, reference.text, reference.sourceName);
}
