import { useCallback } from 'preact/hooks';
import type { WatchEvent } from '../../shared/types.js';
import { loadFile } from './useFile.js';
import { useSSE } from './useSSE.js';
import { fetchTree } from './useTree.js';

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
    // A workspace event means a root was opened or closed, which only the tree
    // can reflect — same refetch as any other structural change.
    if (e.kind === 'add' || e.kind === 'unlink' || e.kind === 'config' || e.kind === 'workspace') {
      void fetchTree();
    }
  }, [currentPath, scrollerRef]);
  useSSE(onWatch);
}
