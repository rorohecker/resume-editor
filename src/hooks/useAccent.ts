import { useEffect, useState } from 'react';

// Editor-chrome accent palette. Three variants, all of which only affect the
// editor UI (buttons, borders, hover states). The rendered resume itself is
// driven by `resume.styles.colors` and is never touched by this hook so prints
// stay neutral regardless of what palette the user picked.
export type AccentTheme = 'minimal' | 'accent' | 'distinct';

const STORAGE_KEY = 'resume-editor:accent';
const ACCENTS: AccentTheme[] = ['minimal', 'accent', 'distinct'];

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

export function applyStoredAccent(): void {
  apply(readStored());
}

export function useAccent(): {
  accent: AccentTheme;
  setAccent: (next: AccentTheme) => void;
} {
  const [accent, setAccentState] = useState<AccentTheme>(() => readStored());
  useEffect(() => {
    apply(accent);
    try {
      localStorage.setItem(STORAGE_KEY, accent);
    } catch {
      // ignore
    }
  }, [accent]);
  return { accent, setAccent: setAccentState };
}
