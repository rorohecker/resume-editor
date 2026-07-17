import { useEffect, useRef } from 'react';
import {
  exportAllData,
  isHydrated,
  listResumes,
  onHydrated,
} from '@/store/persistence';
import { backupIsStale, lastBackupAt, recordBackup } from '@/utils/updateCheck';
import { toast } from '@/hooks/useToast';

// One-time nudge per session if the user has resumes but hasn't exported a
// JSON backup recently. Silent if the user has no resumes (nothing to lose)
// or has backed up within the last 7 days.
export function BackupNag() {
  const fired = useRef(false);

  useEffect(() => {
    const run = () => {
      if (fired.current) return;
      const resumes = listResumes();
      if (resumes.length === 0) return;
      // Never-backed-up only counts as stale if there's actually something to back up
      // AND the resumes have meaningful edits (heuristic: more than just the initial seed).
      const neverBackedUp = lastBackupAt() === null;
      if (neverBackedUp && resumes.length === 1 && resumes[0].sections.every((s) => s.entries.length <= 1)) {
        return;
      }
      if (!backupIsStale()) return;
      fired.current = true;
      toast('Your resume data hasn’t been backed up recently', {
        tone: 'info',
        ttl: 0,
        action: {
          label: 'Back up now',
          onClick: () => {
            void exportAllData().then((data) => {
              const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json;charset=utf-8',
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `resume-editor-backup-${new Date().toISOString().slice(0, 10)}.json`;
              document.body.appendChild(link);
              link.click();
              link.remove();
              URL.revokeObjectURL(url);
              recordBackup();
            });
          },
        },
      });
    };

    if (isHydrated()) {
      run();
    } else {
      const unsubscribe = onHydrated(run);
      return unsubscribe;
    }
  }, []);

  return null;
}
