import { useEffect, useState } from 'react';

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

function apply(theme: 'light' | 'dark'): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

// Called from main.tsx before React mounts so users don't see a flash.
export function applyStoredTheme(): void {
  apply(resolveTheme(readStored()));
}

export function useTheme(): {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (next: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => readStored());
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(readStored()));

  useEffect(() => {
    const r = resolveTheme(theme);
    setResolved(r);
    apply(r);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const r = resolveTheme('system');
      setResolved(r);
      apply(r);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return { theme, resolved, setTheme: setThemeState };
}
