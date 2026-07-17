import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';
import { makeId } from '@/utils/id';

// Sticky notes are an editing scratchpad — reminders the user jots down while
// working on a resume ("quantify this bullet", "ask manager for exact %", etc).
// They are intentionally stored OUTSIDE the Resume document (a separate IDB key
// per resume) so they never leak into exports, share links, PDF/DOCX output, or
// version snapshots — except full-app JSON backups, which include them.

const STICKY_NOTES_PREFIX = 'sticky-notes:';

export const STICKY_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple'] as const;
export type StickyColor = (typeof STICKY_COLORS)[number];

// Sticky notes read as paper regardless of light/dark theme, so the swatches are
// fixed pastel fills with dark ink — not theme tokens.
export const STICKY_COLOR_STYLES: Record<StickyColor, { bg: string; border: string }> = {
  yellow: { bg: '#fef9c3', border: '#fde047' },
  pink: { bg: '#fce7f3', border: '#f9a8d4' },
  blue: { bg: '#dbeafe', border: '#93c5fd' },
  green: { bg: '#dcfce7', border: '#86efac' },
  purple: { bg: '#ede9fe', border: '#c4b5fd' },
};

export interface StickyNote {
  id: string;
  text: string;
  color: StickyColor;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const STICKY_NOTE_DEFAULT_W = 220;
export const STICKY_NOTE_DEFAULT_H = 168;

function isStickyColor(value: unknown): value is StickyColor {
  return typeof value === 'string' && (STICKY_COLORS as readonly string[]).includes(value);
}

function normalizeNote(input: unknown): StickyNote | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<StickyNote>;
  return {
    id: typeof raw.id === 'string' ? raw.id : makeId(),
    text: typeof raw.text === 'string' ? raw.text : '',
    color: isStickyColor(raw.color) ? raw.color : 'yellow',
    x: Number.isFinite(raw.x) ? (raw.x as number) : 80,
    y: Number.isFinite(raw.y) ? (raw.y as number) : 96,
    w: Number.isFinite(raw.w) ? (raw.w as number) : STICKY_NOTE_DEFAULT_W,
    h: Number.isFinite(raw.h) ? (raw.h as number) : STICKY_NOTE_DEFAULT_H,
  };
}

function toError(err: unknown, fallback: string): Error {
  return err instanceof Error ? err : new Error(fallback);
}

export async function loadStickyNotes(
  resumeId: string,
): Promise<{ notes: StickyNote[]; error?: Error }> {
  try {
    const value = await idbGet<unknown>(STICKY_NOTES_PREFIX + resumeId);
    if (value == null) return { notes: [] };
    if (!Array.isArray(value)) {
      return {
        notes: [],
        error: toError(null, 'Sticky notes data was corrupted in browser storage.'),
      };
    }
    return {
      notes: value.map(normalizeNote).filter((note): note is StickyNote => Boolean(note)),
    };
  } catch (err) {
    return {
      notes: [],
      error: toError(err, 'Failed to load sticky notes'),
    };
  }
}

export async function saveStickyNotes(resumeId: string, notes: StickyNote[]): Promise<void> {
  try {
    await idbSet(STICKY_NOTES_PREFIX + resumeId, notes);
  } catch (err) {
    const error = toError(err, 'Failed to save sticky notes');
    console.warn('Failed to persist sticky notes', err);
    throw error;
  }
}

export async function loadAllStickyNotes(): Promise<Record<string, StickyNote[]>> {
  const out: Record<string, StickyNote[]> = {};
  try {
    const allKeys = await idbKeys();
    for (const key of allKeys) {
      if (typeof key !== 'string' || !key.startsWith(STICKY_NOTES_PREFIX)) continue;
      const resumeId = key.slice(STICKY_NOTES_PREFIX.length);
      const { notes, error } = await loadStickyNotes(resumeId);
      if (!error && notes.length > 0) out[resumeId] = notes;
    }
  } catch (err) {
    console.warn('Failed to enumerate sticky notes for backup', err);
  }
  return out;
}

export function deleteStickyNotes(resumeId: string): void {
  void idbDel(STICKY_NOTES_PREFIX + resumeId).catch((err) => {
    console.warn('Failed to delete sticky notes', err);
  });
}

export async function copyStickyNotes(fromResumeId: string, toResumeId: string): Promise<void> {
  const { notes, error } = await loadStickyNotes(fromResumeId);
  if (error || notes.length === 0) return;
  await saveStickyNotes(
    toResumeId,
    notes.map((note) => ({ ...note, id: makeId() })),
  );
}

export function createStickyNote(partial: Partial<StickyNote> = {}): StickyNote {
  return {
    id: makeId(),
    text: '',
    color: 'yellow',
    x: 96,
    y: 110,
    w: STICKY_NOTE_DEFAULT_W,
    h: STICKY_NOTE_DEFAULT_H,
    ...partial,
  };
}
