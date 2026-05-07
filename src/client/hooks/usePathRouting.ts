import { useCallback, useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

function readPathFromUrl(): string | null {
  const sp = new URLSearchParams(window.location.search);
  return sp.get('file');
}

function pushPath(relPath: string, hash = ''): void {
  const url = `?file=${encodeURIComponent(relPath)}${hash}`;
  history.pushState({ file: relPath }, '', url);
}

export const currentPathSignal = signal<string | null>(readPathFromUrl());

export function setCurrentPath(relPath: string | null): void {
  currentPathSignal.value = relPath;
}

export interface PathRouting {
  currentPath: string | null;
  setCurrentPath: (relPath: string | null) => void;
  navigate: (relPath: string, hash?: string) => void;
}

/**
 * Owns the URL ↔ currentPath sync. Listens for popstate so browser back/forward
 * keeps the SPA in step with the address bar.
 */
export function usePathRouting(): PathRouting {
  useEffect(() => {
    const onPop = () => setCurrentPath(readPathFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((relPath: string, hash = '') => {
    setCurrentPath(relPath);
    pushPath(relPath, hash);
  }, []);

  return {
    currentPath: currentPathSignal.value,
    setCurrentPath,
    navigate,
  };
}
