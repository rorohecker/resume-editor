import { beforeEach, describe, expect, it, vi } from 'vitest';

// Persistence writes to IndexedDB; stub them so undo tests stay in-memory.
vi.mock('@/store/persistence', () => ({
  loadResume: () => null,
  saveResumeFast: () => {},
  onPersistError: () => () => {},
  onPersistOk: () => () => {},
}));

import { createResumeFromTemplate } from '@/components/templates/createFromTemplate';
import { useStore } from '@/store';

describe('undoResume batching', () => {
  beforeEach(() => {
    const resume = createResumeFromTemplate('blank');
    useStore.setState({
      currentResume: resume,
      past: [],
      future: [],
      persistError: null,
    });
  });

  it('pushes history and restores on undo', () => {
    const before = useStore.getState().currentResume!;
    useStore.getState().updateCurrentResume((r) => ({
      ...r,
      header: { ...r.header, name: 'First' },
    }));
    expect(useStore.getState().currentResume?.header.name).toBe('First');
    expect(useStore.getState().past.length).toBe(1);

    useStore.getState().undoResume();
    expect(useStore.getState().currentResume?.header.name).toBe(before.header.name);
    expect(useStore.getState().future.length).toBe(1);

    useStore.getState().redoResume();
    expect(useStore.getState().currentResume?.header.name).toBe('First');
  });

  it('batches rapid edits with the same historyKey', () => {
    useStore.getState().updateCurrentResume(
      (r) => ({ ...r, header: { ...r.header, name: 'A' } }),
      { historyKey: 'name' },
    );
    useStore.getState().updateCurrentResume(
      (r) => ({ ...r, header: { ...r.header, name: 'AB' } }),
      { historyKey: 'name' },
    );
    useStore.getState().updateCurrentResume(
      (r) => ({ ...r, header: { ...r.header, name: 'ABC' } }),
      { historyKey: 'name' },
    );
    // Within the 600ms batch window these should share one undo step.
    expect(useStore.getState().past.length).toBe(1);
    useStore.getState().undoResume();
    expect(useStore.getState().currentResume?.header.name).not.toBe('ABC');
  });
});
