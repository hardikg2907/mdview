import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mdview-theme';
const mq = window.matchMedia('(prefers-color-scheme: dark)');

function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // localStorage unavailable
  }
  return null;
}

const stored = readStoredTheme();
export const themeSignal = signal<Theme>(stored ?? (mq.matches ? 'dark' : 'light'));
// Tracks whether user explicitly chose a theme (overrides OS)
export const themeUserOverride = signal<boolean>(stored !== null);

export function setTheme(t: Theme): void {
  themeSignal.value = t;
  themeUserOverride.value = true;
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    // best-effort
  }
}

export function toggleTheme(): void {
  setTheme(themeSignal.value === 'dark' ? 'light' : 'dark');
}

export function useTheme(): Theme {
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => {
      // OS preference only applies if the user has not overridden
      if (!themeUserOverride.value) {
        themeSignal.value = e.matches ? 'dark' : 'light';
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeSignal.value;
  });

  return themeSignal.value;
}
