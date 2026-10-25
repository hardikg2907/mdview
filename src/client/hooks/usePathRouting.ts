import { signal } from '@preact/signals';
import { useCallback, useEffect } from 'preact/hooks';

/**
 * The root to focus when no specific file was requested — `mdview <folder>`
 * produces `?root=<id>`. Read once at startup; navigating replaces it with the
 * `?file=` of whatever gets opened.
 */
export function readRootFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('root');
}

function readPathFromUrl(): string | null {
  const sp = new URLSearchParams(window.location.search);
  return sp.get('file');
}

export function pushPath(relPath: string, hash = ''): void {
  // Why: ?embed=vscode and ?token= must survive SPA-internal navigation. A
  // hard reload without `embed` drops out of embed mode, and one without
  // `token` is refused by an embed-mode server.
  const current = new URLSearchParams(window.location.search);
  const params = new URLSearchParams({ file: relPath });
  for (const key of ['embed', 'token']) {
    const value = current.get(key);
    if (value !== null) params.set(key, value);
  }
  const url = `?${params.toString()}${hash}`;
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
