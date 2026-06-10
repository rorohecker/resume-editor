import { clear as idbClear } from 'idb-keyval';

const APP_STORAGE_PREFIX = 'resume-editor:';

// Removes only the localStorage keys this app owns (AI settings, usage,
// onboarding flags, theme, etc.). Does NOT touch IndexedDB.
export function clearAppLocalData(): void {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(APP_STORAGE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}

// Full wipe: clears localStorage AND the IndexedDB store that holds resumes,
// version snapshots, and the BYOK AI response cache. The previous "Wipe all
// data" button only cleared localStorage, leaving every saved resume and
// snapshot behind in IndexedDB — so "wiped" data reappeared on reload.
export async function wipeAllLocalData(): Promise<void> {
  clearAppLocalData();
  try {
    await idbClear();
  } catch (err) {
    console.warn('Failed to clear IndexedDB during wipe.', err);
  }
}
