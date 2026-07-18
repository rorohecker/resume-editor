import { create } from 'zustand';
import type { Resume, TemplateId } from '@/types';
import {
  createResumeFromTemplate as factory,
  applyTemplate,
} from '@/components/templates/createFromTemplate';
import {
  loadResume as loadFromStorage,
  saveResumeFast,
  onPersistError,
  onPersistOk,
} from './persistence';
import { makeId } from '@/utils/id';
import { copyImportReference } from '@/utils/importReference';

interface UIState {
  aiOpen: boolean;
  tipsOpen: boolean;
  exportOpen: boolean;
  coverLetterOpen: boolean;
  tailorOpen: boolean;
  compareOpen: boolean;
  bulkEditOpen: boolean;
  libraryOpen: boolean;
  variantOpen: boolean;
  shareOpen: boolean;
  shortcutsOpen: boolean;
  stickyNotesOpen: boolean;
  importReferenceOpen: boolean;
  importReferenceAvailable: boolean;
  importReferenceEpoch: number;
  pdfPreviewMode: boolean;
  anonymized: boolean;
  zoom: number;
  mobileTab: 'edit' | 'preview';
  lastSavedAt: number | null;
  persistError: string | null;
  // Section ID the editor should scroll to and expand. Bumped via a counter so
  // re-requesting the same section still fires the effect.
  focusedSectionId: string | null;
  focusedSectionToken: number;
}

interface ResumeState {
  currentResume: Resume | null;
  past: Resume[];
  future: Resume[];
}

interface Actions {
  setAiOpen: (open: boolean) => void;
  setTipsOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setCoverLetterOpen: (open: boolean) => void;
  setTailorOpen: (open: boolean) => void;
  setCompareOpen: (open: boolean) => void;
  setBulkEditOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => void;
  setVariantOpen: (open: boolean) => void;
  setShareOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setStickyNotesOpen: (open: boolean) => void;
  setImportReferenceOpen: (open: boolean) => void;
  setImportReferenceAvailable: (available: boolean) => void;
  bumpImportReference: () => void;
  setPdfPreviewMode: (on: boolean) => void;
  setAnonymized: (on: boolean) => void;
  setZoom: (zoom: number) => void;
  setMobileTab: (tab: 'edit' | 'preview') => void;
  focusSection: (sectionId: string) => void;
  clearPersistError: () => void;
  setPersistError: (message: string | null) => void;

  createResumeFromTemplate: (template: TemplateId) => Resume;
  loadResume: (id: string) => Resume | null;
  setCurrentResume: (resume: Resume | null) => void;
  updateCurrentResume: (updater: (r: Resume) => Resume, options?: { historyKey?: string }) => void;
  changeTemplate: (template: TemplateId) => void;
  undoResume: () => void;
  redoResume: () => void;
  saveNow: () => void;
  createVariantFrom: (resume: Resume, name: string) => Resume;
}

const HISTORY_LIMIT = 50;
const HISTORY_BATCH_MS = 600;

let lastHistoryKey: string | null = null;
let lastHistoryAt = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
// The resume a pending debounced save is holding. Tracked separately so we can
// flush it to storage immediately (on page unload, or before switching to a
// different resume) instead of dropping the last edits.
let pendingResume: Resume | null = null;
const saveListeners = new Set<(time: number) => void>();

function fireSavedListeners(ts: number): void {
  for (const listener of saveListeners) listener(ts);
}

export const useStore = create<UIState & ResumeState & Actions>((set, get) => ({
  aiOpen: false,
  tipsOpen: false,
  exportOpen: false,
  coverLetterOpen: false,
  tailorOpen: false,
  compareOpen: false,
  bulkEditOpen: false,
  libraryOpen: false,
  variantOpen: false,
  shareOpen: false,
  shortcutsOpen: false,
  stickyNotesOpen: false,
  importReferenceOpen: false,
  importReferenceAvailable: false,
  importReferenceEpoch: 0,
  pdfPreviewMode: false,
  anonymized: false,
  zoom: 1,
  mobileTab: 'edit',
  lastSavedAt: null,
  persistError: null,
  focusedSectionId: null,
  focusedSectionToken: 0,

  currentResume: null,
  past: [],
  future: [],

  setAiOpen: (aiOpen) => set({ aiOpen, tipsOpen: aiOpen ? false : get().tipsOpen }),
  setTipsOpen: (tipsOpen) => set({ tipsOpen, aiOpen: tipsOpen ? false : get().aiOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setCoverLetterOpen: (coverLetterOpen) => set({ coverLetterOpen }),
  setTailorOpen: (tailorOpen) => set({ tailorOpen }),
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  setBulkEditOpen: (bulkEditOpen) => set({ bulkEditOpen }),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  setVariantOpen: (variantOpen) => set({ variantOpen }),
  setShareOpen: (shareOpen) => set({ shareOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setStickyNotesOpen: (stickyNotesOpen) => set({ stickyNotesOpen }),
  setImportReferenceOpen: (importReferenceOpen) => set({ importReferenceOpen }),
  setImportReferenceAvailable: (importReferenceAvailable) => set({ importReferenceAvailable }),
  bumpImportReference: () =>
    set((state) => ({
      importReferenceAvailable: true,
      importReferenceOpen: true,
      importReferenceEpoch: state.importReferenceEpoch + 1,
    })),
  setPdfPreviewMode: (pdfPreviewMode) => set({ pdfPreviewMode }),
  setAnonymized: (anonymized) => set({ anonymized }),
  setZoom: (zoom) => set({ zoom: clamp(zoom, 0.5, 1.5) }),
  setMobileTab: (mobileTab) => set({ mobileTab }),
  clearPersistError: () => set({ persistError: null }),
  setPersistError: (persistError) => set({ persistError }),
  focusSection: (sectionId) =>
    set((state) => ({
      focusedSectionId: sectionId,
      focusedSectionToken: state.focusedSectionToken + 1,
      // Make sure mobile users land on the editor pane when they tap a
      // preview header on a narrow screen.
      mobileTab: 'edit',
    })),

  createResumeFromTemplate: (template) => {
    // Persist any pending edits to the resume we're leaving before switching.
    flushPendingSave();
    const resume = factory(template);
    saveResumeFast(resume);
    set({ currentResume: resume, past: [], future: [], lastSavedAt: Date.now() });
    return resume;
  },

  loadResume: (id) => {
    flushPendingSave();
    const resume = loadFromStorage(id);
    if (resume) set({ currentResume: resume, past: [], future: [], lastSavedAt: Date.now() });
    return resume;
  },

  setCurrentResume: (currentResume) => {
    const prev = get().currentResume;
    // Switching to a different resume: flush the outgoing one and reset history.
    // Same resume (e.g. a cross-tab refresh of the doc we're already editing):
    // keep the undo/redo stacks intact so a background sync doesn't nuke the
    // user's ability to undo their own work.
    const sameDoc = Boolean(prev && currentResume && prev.id === currentResume.id);
    if (!sameDoc) flushPendingSave();
    set(
      sameDoc
        ? { currentResume }
        : { currentResume, past: [], future: [] },
    );
    if (currentResume && !sameDoc) scheduleSave(currentResume);
  },

  updateCurrentResume: (updater, options) => {
    const current = get().currentResume;
    if (!current) return;
    const updated = updater(current);
    // If the updater chose to return the same object reference, skip the
    // commit entirely — saves a save and avoids polluting the undo stack.
    if (updated === current) return;
    const next = { ...updated, updatedAt: new Date().toISOString() };

    const now = Date.now();
    const historyKey = options?.historyKey ?? '__general';
    // Coalesce successive edits that arrive within HISTORY_BATCH_MS regardless of
    // whether the caller named a key; that gives typing inside the same field
    // a single undo step without forcing every input to thread a key through.
    // Distinct keys also break the batch so switching fields creates a boundary.
    const batched =
      historyKey === lastHistoryKey && now - lastHistoryAt < HISTORY_BATCH_MS;

    set({
      currentResume: next,
      past: batched ? get().past : [...get().past, current].slice(-HISTORY_LIMIT),
      future: [],
    });
    lastHistoryKey = historyKey;
    lastHistoryAt = now;
    scheduleSave(next);
  },

  changeTemplate: (template) => {
    const current = get().currentResume;
    if (!current) return;
    const next = applyTemplate(current, template);
    set({
      currentResume: next,
      past: [...get().past, current].slice(-HISTORY_LIMIT),
      future: [],
    });
    lastHistoryKey = null;
    scheduleSave(next);
  },

  undoResume: () => {
    const current = get().currentResume;
    const previous = get().past.at(-1);
    if (!current || !previous) return;
    set({
      currentResume: previous,
      past: get().past.slice(0, -1),
      future: [current, ...get().future].slice(0, HISTORY_LIMIT),
    });
    lastHistoryKey = null;
    scheduleSave(previous);
  },

  redoResume: () => {
    const current = get().currentResume;
    const next = get().future[0];
    if (!current || !next) return;
    set({
      currentResume: next,
      past: [...get().past, current].slice(-HISTORY_LIMIT),
      future: get().future.slice(1),
    });
    lastHistoryKey = null;
    scheduleSave(next);
  },

  saveNow: () => {
    const current = get().currentResume;
    if (!current) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    pendingResume = null;
    saveResumeFast(current);
    const ts = Date.now();
    set({ lastSavedAt: ts });
    fireSavedListeners(ts);
  },

  createVariantFrom: (source, name) => {
    const now = new Date().toISOString();
    const variant: Resume = {
      ...structuredClone(source),
      id: makeId(),
      name,
      createdAt: now,
      updatedAt: now,
      variantOf: source.variantOf ?? source.id,
    };
    saveResumeFast(variant);
    void copyImportReference(source.id, variant.id).catch((err) => {
      console.warn('Failed to copy imported resume reference for variant', err);
    });
    return variant;
  },
}));

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function scheduleSave(resume: Resume) {
  if (saveTimer) clearTimeout(saveTimer);
  pendingResume = resume;
  saveTimer = setTimeout(() => {
    saveResumeFast(resume);
    pendingResume = null;
    const ts = Date.now();
    useStore.setState({ lastSavedAt: ts });
    fireSavedListeners(ts);
    saveTimer = null;
  }, 1500);
}

// Writes any debounced-but-not-yet-saved resume to storage right now. Safe to
// call when nothing is pending. Used before switching resumes and on unload.
export function flushPendingSave(): void {
  if (!saveTimer || !pendingResume) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const resume = pendingResume;
  pendingResume = null;
  saveResumeFast(resume);
  const ts = Date.now();
  useStore.setState({ lastSavedAt: ts });
  fireSavedListeners(ts);
}

// Persist in-flight edits if the tab is being closed/refreshed/hidden so the
// 1.5s debounce window can't silently eat the user's most recent changes.
if (typeof window !== 'undefined') {
  const flush = () => flushPendingSave();
  window.addEventListener('beforeunload', flush);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

// Stack-based subscription so multiple components can listen (the toast hint
// in the top nav, plus anything future-us adds).
export function onResumeSaved(listener: (time: number) => void): () => void {
  saveListeners.add(listener);
  return () => {
    saveListeners.delete(listener);
  };
}

// Surface IndexedDB write failures into UI state (and clear on the next OK write).
if (typeof window !== 'undefined') {
  let lastToastAt = 0;
  onPersistError((error) => {
    const message =
      error.name === 'QuotaExceededError' || /quota/i.test(error.message)
        ? 'Storage quota exceeded. Export a backup and free space.'
        : error.message || 'Failed to save to browser storage.';
    useStore.setState({ persistError: message });
    const now = Date.now();
    if (now - lastToastAt > 8000) {
      lastToastAt = now;
      void import('@/hooks/useToast').then(({ toast }) => {
        toast(message, {
          tone: 'danger',
          ttl: 0,
          action: {
            label: 'Retry',
            onClick: () => useStore.getState().saveNow(),
          },
        });
      });
    }
  });
  onPersistOk(() => {
    if (useStore.getState().persistError) {
      useStore.setState({ persistError: null });
    }
  });
}
