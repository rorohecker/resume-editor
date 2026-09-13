import { useSyncExternalStore } from 'react';

// Editor-chrome accent palette. Variants only affect the
// editor UI (buttons, borders, hover states). The rendered resume itself is
// driven by `resume.styles.colors` and is never touched by this hook so prints
// stay neutral regardless of what palette the user picked.
export type AccentTheme =
  | 'minimal'
  | 'accent'
  | 'distinct'
  | 'sakura'
  | 'sunset'
  | 'cosmic';

const STORAGE_KEY = 'resume-editor:accent';
const ACCENTS: AccentTheme[] = [
  'minimal',
  'accent',
  'distinct',
  'sakura',
  'sunset',
  'cosmic',
];

function readStored(): AccentTheme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value && (ACCENTS as string[]).includes(value)) return value as AccentTheme;
  } catch {
    // localStorage may throw in private browsing — fall through to default.
  }
  return 'accent';
}

function apply(accent: AccentTheme): void {
  const root = document.documentElement;
  for (const variant of ACCENTS) {
    root.classList.toggle(`accent-${variant}`, variant === accent);
  }
}

// Shared store so every AccentToggle stays in sync.
let currentAccent: AccentTheme = typeof window !== 'undefined' ? readStored() : 'accent';
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

function setAccent(next: AccentTheme): void {
  if (next === currentAccent) return;
  currentAccent = next;
  apply(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
  notify();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    if (!(ACCENTS as string[]).includes(event.newValue)) return;
    currentAccent = event.newValue as AccentTheme;
    apply(currentAccent);
    notify();
  });
}

export function applyStoredAccent(): void {
  currentAccent = readStored();
  apply(currentAccent);
}

export function useAccent(): {
  accent: AccentTheme;
  setAccent: (next: AccentTheme) => void;
} {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { accent: currentAccent, setAccent };
}
