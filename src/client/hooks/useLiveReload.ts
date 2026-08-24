import { useCallback } from 'preact/hooks';
import type { RenderedFile, WatchEvent } from '../../shared/types.js';
import { fileSignal, loadFile } from './useFile.js';
import { useSSE } from './useSSE.js';
import { fetchTree } from './useTree.js';

/**
 * Whether a watch event is about the document currently on screen.
 *
 * Compares against the path the *server* used, not the one we asked for. A
 * request that arrives unprefixed — a bookmark from before paths carried a root
 * id, or the VS Code extension sending a workspace-relative path — resolves
 * against the primary root and comes back workspace-scoped. Watch events always
 * carry the scoped form, so comparing with the requested path would silently
 * never match and the page would stop live-reloading.
 */
export function shouldReloadFile(
  e: WatchEvent,
  file: RenderedFile | null,
  currentPath: string | null,
): boolean {
  if (e.kind !== 'change') return false;
  const active = file?.relPath ?? currentPath;
  return active !== null && e.relPath === active;
}

interface ScrollerRef {
  current: HTMLElement | null;
}

interface Args {
  currentPath: string | null;
  scrollerRef: ScrollerRef;
}

export function useLiveReload({ currentPath, scrollerRef }: Args): void {
  const onWatch = useCallback((e: WatchEvent) => {
    if (shouldReloadFile(e, fileSignal.value, currentPath)) {
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
