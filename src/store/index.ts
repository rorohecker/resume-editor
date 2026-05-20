import { create } from 'zustand';
import type { Resume, TemplateId } from '@/types';
import {
  createResumeFromTemplate as factory,
  applyTemplate,
} from '@/components/templates/createFromTemplate';
import { loadResume as loadFromStorage, saveResumeFast } from './persistence';
import { makeId } from '@/utils/id';

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
  pdfPreviewMode: boolean;
  anonymized: boolean;
  zoom: number;
  mobileTab: 'edit' | 'preview';
  lastSavedAt: number | null;
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
  setPdfPreviewMode: (on: boolean) => void;
  setAnonymized: (on: boolean) => void;
  setZoom: (zoom: number) => void;
  setMobileTab: (tab: 'edit' | 'preview') => void;

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
  pdfPreviewMode: false,
  anonymized: false,
  zoom: 1,
  mobileTab: 'edit',
  lastSavedAt: null,

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
  setPdfPreviewMode: (pdfPreviewMode) => set({ pdfPreviewMode }),
  setAnonymized: (anonymized) => set({ anonymized }),
  setZoom: (zoom) => set({ zoom: clamp(zoom, 0.5, 1.5) }),
  setMobileTab: (mobileTab) => set({ mobileTab }),

  createResumeFromTemplate: (template) => {
    const resume = factory(template);
    saveResumeFast(resume);
    set({ currentResume: resume, past: [], future: [], lastSavedAt: Date.now() });
    return resume;
  },

  loadResume: (id) => {
    const resume = loadFromStorage(id);
    if (resume) set({ currentResume: resume, past: [], future: [], lastSavedAt: Date.now() });
    return resume;
  },

  setCurrentResume: (currentResume) => {
    set({ currentResume, past: [], future: [] });
    if (currentResume) scheduleSave(currentResume);
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
    return variant;
  },
}));

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function scheduleSave(resume: Resume) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveResumeFast(resume);
    const ts = Date.now();
    useStore.setState({ lastSavedAt: ts });
    fireSavedListeners(ts);
    saveTimer = null;
  }, 1500);
}

// Stack-based subscription so multiple components can listen (the toast hint
// in the top nav, plus anything future-us adds).
export function onResumeSaved(listener: (time: number) => void): () => void {
  saveListeners.add(listener);
  return () => {
    saveListeners.delete(listener);
  };
}
