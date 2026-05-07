import { useEffect } from 'preact/hooks';
import type { OutlineNode } from '../../shared/types.js';
import { closeSearch, searchOpenSignal } from './useSearch.js';
import { closeLightbox, lightboxSignal } from './useLightbox.js';
import { closeShortcutsPanel, shortcutsPanelSignal } from './useShortcutsPanel.js';
import { closePalette, paletteOpenSignal } from './useCommandPalette.js';
import {
  shortcuts,
  resetPendingSequences,
  type ShortcutContext,
} from '../shortcuts.js';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Esc has stateful priority: it closes whichever overlay is open, in
 * lightbox → palette → panel → search order. This isn't expressible as a
 * per-shortcut matcher because the priority depends on signal state, so we
 * handle it inline before the registry walk.
 */
function handleEscape(ev: KeyboardEvent): boolean {
  if (ev.key !== 'Escape') return false;
  if (lightboxSignal.value) { closeLightbox(); ev.preventDefault(); return true; }
  if (paletteOpenSignal.value) { closePalette(); ev.preventDefault(); return true; }
  if (shortcutsPanelSignal.value) { closeShortcutsPanel(); ev.preventDefault(); return true; }
  if (searchOpenSignal.value) { closeSearch(); ev.preventDefault(); return true; }
  return false;
}

interface Args {
  outline: OutlineNode[];
  onJumpHeading: (id: string) => void;
  navigate: (relPath: string) => void;
}

export function useKeyboardShortcuts(args: Args): void {
  useEffect(() => {
    const ctx: ShortcutContext = {
      outline: args.outline,
      onJumpHeading: args.onJumpHeading,
      navigate: args.navigate,
    };
    function handler(ev: KeyboardEvent) {
      if (handleEscape(ev)) return;
      const typing = isTypingTarget(ev.target);
      for (const sc of shortcuts) {
        if (typing && sc.whenTyping === 'block') continue;
        if (sc.match(ev)) {
          ev.preventDefault();
          sc.run(ctx);
          resetPendingSequences(ev);
          return;
        }
      }
      // No match — reset any pending sequence state (e.g. dangling `g`)
      resetPendingSequences(ev);
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [args.outline, args.onJumpHeading, args.navigate]);
}
