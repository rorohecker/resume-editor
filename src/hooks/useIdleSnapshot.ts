import { useEffect, useRef } from 'react';
import { useStore } from '@/store';
import { createVersionSnapshot, listVersionSnapshots } from '@/store/persistence';

// Automatic snapshots on inactivity: after the user has been idle for
// IDLE_MS following at least one edit, create a named auto-snapshot. Caps the
// auto-snapshot frequency so a writer who pauses repeatedly doesn't fill the
// 20-slot snapshot list with auto-saves.

const IDLE_MS = 10 * 60 * 1000; // 10 minutes
const MIN_INTERVAL_MS = 30 * 60 * 1000; // at least 30m between auto-snapshots
const AUTO_PREFIX = 'Auto: ';

export function useIdleSnapshot(): void {
  const resumeId = useStore((s) => s.currentResume?.id);
  const lastSavedAt = useStore((s) => s.lastSavedAt);
  const lastAutoRef = useRef<{ resumeId: string; at: number } | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!resumeId || !lastSavedAt) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const resume = useStore.getState().currentResume;
      if (!resume || resume.id !== resumeId) return;
      const recent = lastAutoRef.current;
      if (recent && recent.resumeId === resumeId && Date.now() - recent.at < MIN_INTERVAL_MS) {
        return;
      }
      const existing = listVersionSnapshots(resumeId);
      // Don't auto-snapshot if the latest snapshot already matches.
      if (existing[0]?.resume.updatedAt === resume.updatedAt) return;
      createVersionSnapshot(resume, `${AUTO_PREFIX}${new Date().toLocaleString()}`);
      lastAutoRef.current = { resumeId, at: Date.now() };
    }, IDLE_MS);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [resumeId, lastSavedAt]);
}
