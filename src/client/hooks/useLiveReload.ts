import { useCallback } from 'preact/hooks';
import { useSSE } from './useSSE.js';
import { loadFile } from './useFile.js';
import { fetchTree } from './useTree.js';
import type { WatchEvent } from '../../shared/types.js';

interface ScrollerRef {
  current: HTMLElement | null;
}

interface Args {
  currentPath: string | null;
  scrollerRef: ScrollerRef;
}

export function useLiveReload({ currentPath, scrollerRef }: Args): void {
  const onWatch = useCallback((e: WatchEvent) => {
    if (e.kind === 'change' && e.relPath === currentPath) {
      const top = scrollerRef.current?.scrollTop ?? 0;
      void loadFile(currentPath).then(() => {
        requestAnimationFrame(() => {
          if (scrollerRef.current) scrollerRef.current.scrollTop = top;
        });
      });
      return;
    }
    if (e.kind === 'add' || e.kind === 'unlink' || e.kind === 'config') {
      void fetchTree();
    }
  }, [currentPath, scrollerRef]);
  useSSE(onWatch);
}
