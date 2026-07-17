import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderSync } from 'lucide-react';
import { exportAllData } from '@/store/persistence';
import { onResumeSaved } from '@/store';
import {
  clearPersistedHandle,
  ensureWritePermission,
  isFileSystemAccessSupported,
  loadPersistedHandle,
  pickFileForSync,
  writeJsonToHandle,
} from '@/utils/fileSync';
import { recordBackup } from '@/utils/updateCheck';
import { toast } from '@/hooks/useToast';

// Topnav control for "Auto-save to file" via the File System Access API.
// Hidden entirely on browsers that don't expose showSaveFilePicker (Firefox,
// Safari). On supported browsers, picking a file once causes every subsequent
// resume save to also append a JSON dump of the entire IDB to that file.

export function FileSyncControl() {
  const { t } = useTranslation();
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const writingRef = useRef(false);
  const queuedRef = useRef(false);

  // Restore the last-picked handle on mount.
  useEffect(() => {
    if (!isFileSystemAccessSupported()) return;
    void loadPersistedHandle().then((h) => {
      if (h) {
        setHandle(h);
        // Permission may need a user gesture to re-grant.
        setNeedsPermission(true);
      }
    });
  }, []);

  // Whenever the resume saves, also write to the synced file if we have a
  // granted handle. Coalesce concurrent saves so we never overlap two writes
  // on the same file.
  useEffect(() => {
    if (!handle || needsPermission) return;
    const flush = async () => {
      if (writingRef.current) {
        queuedRef.current = true;
        return;
      }
      writingRef.current = true;
      try {
        await writeJsonToHandle(handle, await exportAllData());
      } catch (err) {
        // If the file was moved/deleted or permission was revoked, surface it
        // and drop the handle so the user can re-pick.
        console.warn('File sync write failed', err);
        toast(t('editor.fileSyncFailed', { defaultValue: 'Auto-save to file failed' }), {
          tone: 'warn',
          ttl: 4000,
        });
        setHandle(null);
        void clearPersistedHandle();
      } finally {
        writingRef.current = false;
        if (queuedRef.current) {
          queuedRef.current = false;
          void flush();
        }
      }
    };
    return onResumeSaved(() => {
      void flush();
    });
  }, [handle, needsPermission, t]);

  if (!isFileSystemAccessSupported()) return null;

  const enable = async () => {
    const picked = await pickFileForSync();
    if (picked) {
      setHandle(picked);
      setNeedsPermission(false);
      // Initial write so the file isn't empty until the next edit.
      try {
        await writeJsonToHandle(picked, await exportAllData());
        recordBackup();
        toast(
          t('editor.fileSyncEnabled', { defaultValue: 'Auto-save to file enabled' }),
          { tone: 'success', ttl: 2200 },
        );
      } catch {
        // Permission failure on first write — same surface as the regular failure case.
        toast(t('editor.fileSyncFailed', { defaultValue: 'Auto-save to file failed' }), {
          tone: 'warn',
          ttl: 4000,
        });
        setHandle(null);
        void clearPersistedHandle();
      }
    }
  };

  const regrant = async () => {
    if (!handle) return;
    const granted = await ensureWritePermission(handle);
    if (granted) {
      setNeedsPermission(false);
      try {
        await writeJsonToHandle(handle, await exportAllData());
        recordBackup();
      } catch {
        // ignore
      }
    } else {
      // User denied — drop the handle.
      setHandle(null);
      void clearPersistedHandle();
    }
  };

  const disable = async () => {
    setHandle(null);
    setNeedsPermission(false);
    await clearPersistedHandle();
    toast(t('editor.fileSyncDisabled', { defaultValue: 'Auto-save to file disabled' }), {
      tone: 'info',
      ttl: 1800,
    });
  };

  if (!handle) {
    return (
      <button
        type="button"
        onClick={enable}
        className="icon-btn"
        title={t('editor.fileSyncOff', {
          defaultValue: 'Auto-save to a file on disk (Chrome / Edge)',
        })}
        aria-label="Enable auto-save to file"
      >
        <FolderSync size={16} />
      </button>
    );
  }

  if (needsPermission) {
    return (
      <button
        type="button"
        onClick={regrant}
        className="icon-btn bg-warn/10 text-warn"
        title={t('editor.fileSyncResume', {
          defaultValue: `Re-grant access to ${handle.name}`,
          name: handle.name,
        })}
        aria-label="Re-grant file access"
      >
        <FolderSync size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={disable}
      className="icon-btn bg-paper-tint text-ink"
      title={t('editor.fileSyncOn', {
        defaultValue: `Auto-saving to ${handle.name}. Click to turn off.`,
        name: handle.name,
      })}
      aria-label="Disable auto-save to file"
      aria-pressed
    >
      <FolderSync size={16} />
    </button>
  );
}
