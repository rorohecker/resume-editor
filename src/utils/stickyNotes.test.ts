import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStickyNote,
  loadStickyNotes,
  saveStickyNotes,
} from '@/utils/stickyNotes';

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

describe('stickyNotes persistence', () => {
  beforeEach(() => {
    store.clear();
  });

  it('round-trips notes through save/load', async () => {
    const notes = [createStickyNote({ text: 'quantify impact', x: 10, y: 20 })];
    await saveStickyNotes('r1', notes);
    const loaded = await loadStickyNotes('r1');
    expect(loaded.error).toBeUndefined();
    expect(loaded.notes).toHaveLength(1);
    expect(loaded.notes[0]?.text).toBe('quantify impact');
  });

  it('returns an error for corrupt non-array IDB values without inventing success', async () => {
    store.set('sticky-notes:r1', { broken: true });
    const loaded = await loadStickyNotes('r1');
    expect(loaded.error).toBeInstanceOf(Error);
    expect(loaded.notes).toEqual([]);
  });

  it('treats missing keys as empty success', async () => {
    const loaded = await loadStickyNotes('missing');
    expect(loaded.error).toBeUndefined();
    expect(loaded.notes).toEqual([]);
  });
});
