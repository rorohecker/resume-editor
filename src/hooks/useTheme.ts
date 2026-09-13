import { useEffect, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'resume-editor:theme';

function readStored(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // localStorage may throw in private browsing — fall through to default.
  }
  return 'system';
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function apply(resolved: 'light' | 'dark'): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#18181b' : '#ffffff');
}

// Shared store so every ThemeToggle stays in sync and DOM updates once.
let currentTheme: Theme = typeof window !== 'undefined' ? readStored() : 'system';
let snapshotVersion = 0;
const listeners = new Set<() => void>();

function notify(): void {
  snapshotVersion += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): number {
  return snapshotVersion;
}

function getServerSnapshot(): number {
  return 0;
}

function setTheme(next: Theme): void {
  if (next === currentTheme) return;
  currentTheme = next;
  apply(resolveTheme(next));
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
  notify();
}

let systemMq: MediaQueryList | null = null;

function onSystemPreferenceChange(): void {
  if (currentTheme !== 'system') return;
  apply(resolveTheme('system'));
  notify();
}

function ensureSystemListener(): void {
  if (systemMq) return;
  systemMq = window.matchMedia('(prefers-color-scheme: dark)');
  systemMq.addEventListener('change', onSystemPreferenceChange);
}

function removeSystemListener(): void {
  systemMq?.removeEventListener('change', onSystemPreferenceChange);
  systemMq = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    const next = event.newValue;
    if (next !== 'light' && next !== 'dark' && next !== 'system') return;
    currentTheme = next;
    apply(resolveTheme(next));
    notify();
  });
}

// Called from main.tsx before React mounts so users don't see a flash.
export function applyStoredTheme(): void {
  currentTheme = readStored();
  apply(resolveTheme(currentTheme));
  if (currentTheme === 'system') ensureSystemListener();
}

export function useTheme(): {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (next: Theme) => void;
} {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const theme = currentTheme;

  useEffect(() => {
    if (theme === 'system') {
      ensureSystemListener();
      return removeSystemListener;
    }
    removeSystemListener();
  }, [theme]);

  return {
    theme,
    resolved: resolveTheme(theme),
    setTheme,
  };
}
