import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { makeId } from '@/utils/id';

// Sticky notes are an editing scratchpad — reminders the user jots down while
// working on a resume ("quantify this bullet", "ask manager for exact %", etc).
// They are intentionally stored OUTSIDE the Resume document (a separate IDB key
// per resume) so they never leak into exports, share links, PDF/DOCX output, or
// version snapshots.

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

export async function loadStickyNotes(resumeId: string): Promise<StickyNote[]> {
  try {
    const value = await idbGet<unknown>(STICKY_NOTES_PREFIX + resumeId);
    if (!Array.isArray(value)) return [];
    return value.map(normalizeNote).filter((note): note is StickyNote => Boolean(note));
  } catch {
    return [];
  }
}

export function saveStickyNotes(resumeId: string, notes: StickyNote[]): void {
  void idbSet(STICKY_NOTES_PREFIX + resumeId, notes).catch((err) =>
    console.warn('Failed to persist sticky notes', err),
  );
}

export function deleteStickyNotes(resumeId: string): void {
  void idbDel(STICKY_NOTES_PREFIX + resumeId).catch(() => {});
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
