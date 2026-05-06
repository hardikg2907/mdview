import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

export type Theme = 'light' | 'dark';

const mq = window.matchMedia('(prefers-color-scheme: dark)');
export const themeSignal = signal<Theme>(mq.matches ? 'dark' : 'light');

export function useTheme(): Theme {
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => {
      themeSignal.value = e.matches ? 'dark' : 'light';
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeSignal.value;
  });

  return themeSignal.value;
}
