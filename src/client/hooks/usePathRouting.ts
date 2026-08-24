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
  // Why: the ?embed=vscode query must survive SPA-internal navigation so that a
  // hard reload (or any new history entry the extension intercepts) keeps the
  // page in embed mode. The extension contract requires this param to be
  // present whenever the SPA is running inside the VS Code webview.
  const current = new URLSearchParams(window.location.search);
  const embed = current.get('embed');
  const params = new URLSearchParams({ file: relPath });
  if (embed !== null) params.set('embed', embed);
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
