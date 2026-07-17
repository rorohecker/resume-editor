import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GripHorizontal, Plus, StickyNote as StickyNoteIcon, Trash2, X } from 'lucide-react';
import { useStore } from '@/store';
import {
  STICKY_COLORS,
  STICKY_COLOR_STYLES,
  STICKY_NOTE_DEFAULT_H,
  STICKY_NOTE_DEFAULT_W,
  createStickyNote,
  loadStickyNotes,
  saveStickyNotes,
  type StickyNote,
} from '@/utils/stickyNotes';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// A free-floating scratchpad of draggable notes layered over the editor. Notes
// live in their own IndexedDB key (see utils/stickyNotes), so they never touch
// the resume document, its exports, or the print output (`print:hidden`).
export function StickyNotes({ resumeId }: { resumeId: string }) {
  const { t } = useTranslation();
  const open = useStore((s) => s.stickyNotesOpen);
  const setOpen = useStore((s) => s.setStickyNotesOpen);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  // Tracks which resume's notes are currently loaded, so a debounced save never
  // writes a previous resume's notes under a freshly switched id — and never
  // after a failed load (which would wipe stored notes with []).
  const loadedFor = useRef<string | null>(null);
  const notesRef = useRef<StickyNote[]>(notes);
  const dirtyRef = useRef(false);
  const lastErrorToastAt = useRef(0);
  notesRef.current = notes;

  const notifyStickyError = useCallback((message: string) => {
    setStorageError(message);
    const now = Date.now();
    if (now - lastErrorToastAt.current < 8000) return;
    lastErrorToastAt.current = now;
    void import('@/hooks/useToast').then(({ toast }) => {
      toast(message, { tone: 'danger', ttl: 6000 });
    });
  }, []);

  const flushSave = useCallback(
    (id: string, nextNotes: StickyNote[]) => {
      if (loadedFor.current !== id) return;
      dirtyRef.current = false;
      void saveStickyNotes(id, nextNotes)
        .then(() => setStorageError(null))
        .catch(() => {
          dirtyRef.current = true;
          notifyStickyError(
            t('stickyNotes.saveFailed', {
              defaultValue: 'Could not save sticky notes. Changes may be lost.',
            }),
          );
        });
    },
    [notifyStickyError, t],
  );

  useEffect(() => {
    let cancelled = false;
    const previousId = loadedFor.current;
    const previousNotes = notesRef.current;
    const previousDirty = dirtyRef.current;

    // Flush outgoing resume before switching so the debounce timer can't drop edits.
    if (previousId && previousId !== resumeId && previousDirty) {
      void saveStickyNotes(previousId, previousNotes).catch(() => {});
    }

    loadedFor.current = null;
    dirtyRef.current = false;
    setNotes([]);
    setStorageError(null);

    void loadStickyNotes(resumeId).then(({ notes: loaded, error }) => {
      if (cancelled) return;
      if (error) {
        // Do NOT mark loadedFor or enable saves — empty notes must not overwrite IDB.
        notifyStickyError(
          t('stickyNotes.loadFailed', {
            defaultValue: 'Could not load sticky notes from browser storage.',
          }),
        );
        return;
      }
      setNotes(loaded);
      loadedFor.current = resumeId;
      dirtyRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [resumeId, notifyStickyError, t]);

  useEffect(() => {
    if (loadedFor.current !== resumeId) return;
    dirtyRef.current = true;
    const timer = setTimeout(() => flushSave(resumeId, notes), 400);
    return () => clearTimeout(timer);
  }, [notes, resumeId, flushSave]);

  // Mirror resume persistence: flush pending sticky edits on tab close / hide.
  useEffect(() => {
    const flush = () => {
      if (loadedFor.current !== resumeId || !dirtyRef.current) return;
      dirtyRef.current = false;
      // beforeunload cannot await; fire-and-forget is best-effort.
      void saveStickyNotes(resumeId, notesRef.current).catch(() => {});
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [resumeId]);

  const updateNote = useCallback((id: string, patch: Partial<StickyNote>) => {
    setNotes((cur) => cur.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  const removeNote = useCallback((id: string) => {
    setNotes((cur) => cur.filter((n) => n.id !== id));
  }, []);

  const addNote = useCallback(() => {
    setNotes((cur) => {
      const cascade = (cur.length % 6) * 26;
      const x = clamp(140 + cascade, 8, window.innerWidth - STICKY_NOTE_DEFAULT_W - 8);
      const y = clamp(120 + cascade, 64, Math.max(64, window.innerHeight - STICKY_NOTE_DEFAULT_H - 8));
      return [...cur, createStickyNote({ x, y })];
    });
    setOpen(true);
  }, [setOpen]);

  const startDrag = useCallback(
    (event: React.PointerEvent, note: StickyNote) => {
      if ((event.target as HTMLElement).closest('button')) return;
      event.preventDefault();
      const offsetX = event.clientX - note.x;
      const offsetY = event.clientY - note.y;
      const move = (ev: PointerEvent) => {
        const x = clamp(ev.clientX - offsetX, 4, window.innerWidth - note.w - 4);
        const y = clamp(ev.clientY - offsetY, 56, window.innerHeight - 44);
        updateNote(note.id, { x, y });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [updateNote],
  );

  return (
    <>
      {open && (
        <div className="pointer-events-none fixed inset-0 z-20 print:hidden" aria-live="polite">
          {notes.map((note) => (
            <StickyNoteCard
              key={note.id}
              note={note}
              onChange={updateNote}
              onRemove={removeNote}
              onDragStart={startDrag}
            />
          ))}
          {storageError && (
            <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4">
              <p className="rounded-md bg-red-700/90 px-3 py-1.5 text-xs text-white" role="status">
                {storageError}
              </p>
            </div>
          )}
          {notes.length === 0 && !storageError && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
              <p className="rounded-md bg-ink/70 px-3 py-1.5 text-xs text-paper">
                {t('stickyNotes.empty', { defaultValue: 'No notes yet — add one with the + button.' })}
              </p>
            </div>
          )}
        </div>
      )}

      {open && (
        <button
          type="button"
          onClick={addNote}
          className="fixed bottom-24 right-[5.25rem] z-30 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-paper shadow-page transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent print:hidden"
          title={t('stickyNotes.add', { defaultValue: 'Add sticky note' })}
          aria-label={t('stickyNotes.add', { defaultValue: 'Add sticky note' })}
        >
          <Plus size={18} />
        </button>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`fixed bottom-24 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-page transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent print:hidden ${
          open ? 'bg-accent text-white' : 'bg-paper text-ink ring-1 ring-paper-edge'
        }`}
        title={t('stickyNotes.toggle', { defaultValue: 'Sticky notes' })}
        aria-label={t('stickyNotes.toggle', { defaultValue: 'Sticky notes' })}
        aria-pressed={open}
      >
        {open ? <X size={18} /> : <StickyNoteIcon size={18} />}
        {!open && notes.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {notes.length}
          </span>
        )}
      </button>
    </>
  );
}

function StickyNoteCard({
  note,
  onChange,
  onRemove,
  onDragStart,
}: {
  note: StickyNote;
  onChange: (id: string, patch: Partial<StickyNote>) => void;
  onRemove: (id: string) => void;
  onDragStart: (event: React.PointerEvent, note: StickyNote) => void;
}) {
  const { t } = useTranslation();
  const palette = STICKY_COLOR_STYLES[note.color];

  const cycleColor = () => {
    const index = STICKY_COLORS.indexOf(note.color);
    onChange(note.id, { color: STICKY_COLORS[(index + 1) % STICKY_COLORS.length] });
  };

  return (
    <div
      className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-md shadow-page"
      style={{
        left: note.x,
        top: note.y,
        width: note.w,
        height: note.h,
        backgroundColor: palette.bg,
        border: `1px solid ${palette.border}`,
      }}
    >
      <div
        onPointerDown={(event) => onDragStart(event, note)}
        className="flex cursor-grab items-center gap-1 px-1.5 py-1 active:cursor-grabbing"
        style={{ backgroundColor: palette.border }}
      >
        <GripHorizontal size={13} className="text-slate-700/70" />
        <span className="flex-1" />
        <button
          type="button"
          onClick={cycleColor}
          className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-black/10 focus:outline-none"
          title={t('stickyNotes.color', { defaultValue: 'Change color' })}
          aria-label={t('stickyNotes.color', { defaultValue: 'Change color' })}
        >
          <span className="h-3 w-3 rounded-full border border-slate-600/40" style={{ backgroundColor: palette.bg }} />
        </button>
        <button
          type="button"
          onClick={() => onRemove(note.id)}
          className="flex h-5 w-5 items-center justify-center rounded text-slate-700/70 hover:bg-black/10 hover:text-slate-900 focus:outline-none"
          title={t('stickyNotes.delete', { defaultValue: 'Delete note' })}
          aria-label={t('stickyNotes.delete', { defaultValue: 'Delete note' })}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <textarea
        value={note.text}
        onChange={(event) => onChange(note.id, { text: event.target.value })}
        placeholder={t('stickyNotes.placeholder', { defaultValue: 'Type a note…' })}
        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] leading-snug text-slate-800 placeholder:text-slate-500/70 focus:outline-none"
        aria-label={t('stickyNotes.noteLabel', { defaultValue: 'Sticky note' })}
        spellCheck={false}
      />
    </div>
  );
}
