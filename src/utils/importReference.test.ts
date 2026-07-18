import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendImportReference,
  loadAllImportReferences,
  loadImportReference,
  saveImportReference,
} from '@/utils/importReference';

const store = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: async (key: string) => store.get(key),
  set: async (key: string, value: unknown) => {
    store.set(key, value);
  },
  del: async (key: string) => {
    store.delete(key);
  },
  keys: async () => [...store.keys()],
}));

describe('imported resume reference persistence', () => {
  beforeEach(() => {
    store.clear();
  });

  it('round-trips imported source text', async () => {
    await saveImportReference('r1', 'Original resume text', 'resume.pdf');
    const loaded = await loadImportReference('r1');

    expect(loaded.error).toBeUndefined();
    expect(loaded.reference?.text).toBe('Original resume text');
    expect(loaded.reference?.sourceName).toBe('resume.pdf');
  });

  it('persists original PDF/DOCX bytes for sidebar preview', async () => {
    await saveImportReference('r1', 'Extracted text', 'resume.pdf', {
      base64: btoa('%PDF-1.4 fake'),
      mime: 'application/pdf',
      name: 'resume.pdf',
    });
    const loaded = await loadImportReference('r1');
    expect(loaded.reference?.original?.mime).toBe('application/pdf');
    expect(loaded.reference?.original?.base64).toBe(btoa('%PDF-1.4 fake'));
  });

  it('keeps prior original when appending text-only import', async () => {
    await saveImportReference('r1', 'First resume', 'one.pdf', {
      base64: btoa('pdf-one'),
      mime: 'application/pdf',
      name: 'one.pdf',
    });
    await appendImportReference('r1', 'Second resume', 'two.txt');
    const loaded = await loadImportReference('r1');
    expect(loaded.reference?.original?.name).toBe('one.pdf');
    expect(loaded.reference?.sourceName).toBe('one.pdf + two.txt');
  });

  it('appends later merge imports without losing the original', async () => {
    await saveImportReference('r1', 'First resume', 'one.pdf');
    await appendImportReference('r1', 'Second resume', 'two.pdf');
    const loaded = await loadImportReference('r1');

    expect(loaded.reference?.text).toContain('First resume');
    expect(loaded.reference?.text).toContain('Second resume');
    expect(loaded.reference?.text).toContain('two.pdf');
    expect(loaded.reference?.sourceName).toBe('one.pdf + two.pdf');
  });

  it('includes references in full-app backup enumeration', async () => {
    await saveImportReference('r1', 'One');
    await saveImportReference('r2', 'Two');

    const references = await loadAllImportReferences();
    expect(Object.keys(references)).toEqual(['r1', 'r2']);
  });

  it('reports corrupt stored data instead of overwriting it during a merge', async () => {
    store.set('import-reference:r1', { broken: true });

    const loaded = await loadImportReference('r1');
    expect(loaded.error).toBeInstanceOf(Error);
    await expect(appendImportReference('r1', 'New text')).rejects.toThrow();
    expect(store.get('import-reference:r1')).toEqual({ broken: true });
  });
});
