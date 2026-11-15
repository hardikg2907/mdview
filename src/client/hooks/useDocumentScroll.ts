import { useEffect } from 'preact/hooks';
import { expandSectionContaining } from '../lib/collapsible-sections.js';
import { fileSignal } from './useFile.js';

interface ScrollerRef {
  current: HTMLElement | null;
}

// Keyed on the document's path, not the file signal: a live reload replaces the
// signal's value, and resetting here would undo the scroll position it restores.
export function useDocumentScroll(scrollerRef: ScrollerRef): void {
  const relPath = fileSignal.value?.relPath;
  useEffect(() => {
    if (relPath === undefined || !scrollerRef.current) return;
    const hash = window.location.hash.slice(1);
    if (hash) {
      requestAnimationFrame(() => {
        expandSectionContaining(hash);
        document.getElementById(hash)?.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
    } else {
      scrollerRef.current.scrollTop = 0;
    }
  }, [relPath]);
}
