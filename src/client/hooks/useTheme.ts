import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { createPersistedString } from '../lib/persisted-signal.js';

export type Theme = 'light' | 'dark';
const THEMES = ['light', 'dark'] as const;

const mq = window.matchMedia('(prefers-color-scheme: dark)');

function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem('mdview-theme');
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // localStorage unavailable
  }
  return null;
}

const initialStored = readStoredTheme();
const persisted = createPersistedString<Theme>(
  'mdview-theme',
  initialStored ?? (mq.matches ? 'dark' : 'light'),
  THEMES,
);

export const themeSignal = persisted.signal;
// Tracks whether user explicitly chose a theme (overrides OS)
export const themeUserOverride = signal<boolean>(initialStored !== null);

export function setTheme(t: Theme): void {
  persisted.set(t);
  themeUserOverride.value = true;
}

export function toggleTheme(): void {
  setTheme(themeSignal.value === 'dark' ? 'light' : 'dark');
}

export function useTheme(): Theme {
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => {
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
