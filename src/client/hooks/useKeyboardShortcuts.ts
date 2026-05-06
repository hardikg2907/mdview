import { useEffect } from 'preact/hooks';
import type { OutlineNode } from '../../shared/types.js';
import { toggleTreeCollapsed, toggleOutlineCollapsed } from './useUiState.js';
import { toggleTheme } from './useTheme.js';
import { openSearch, closeSearch, searchOpenSignal } from './useSearch.js';
import { closeLightbox, lightboxSignal } from './useLightbox.js';
import {
  openShortcutsPanel,
  closeShortcutsPanel,
  shortcutsPanelSignal,
} from './useShortcutsPanel.js';
import { activeHeadingId } from './useScrollSpy.js';

function flattenIds(nodes: OutlineNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    out.push(n.id);
    out.push(...flattenIds(n.children));
  }
  return out;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

interface Args {
  outline: OutlineNode[];
  onJumpHeading: (id: string) => void;
}

export function useKeyboardShortcuts({ outline, onJumpHeading }: Args): void {
  useEffect(() => {
    function handler(ev: KeyboardEvent) {
      const meta = ev.metaKey || ev.ctrlKey;
      const typing = isTypingTarget(ev.target);

      // Esc — close any open overlay
      if (ev.key === 'Escape') {
        if (lightboxSignal.value) {
          closeLightbox();
          ev.preventDefault();
          return;
        }
        if (shortcutsPanelSignal.value) {
          closeShortcutsPanel();
          ev.preventDefault();
          return;
        }
        if (searchOpenSignal.value) {
          closeSearch();
          ev.preventDefault();
          return;
        }
      }

      // ? — open shortcuts panel (allowed even while typing if Shift+/)
      if (ev.key === '?' && !typing) {
        ev.preventDefault();
        openShortcutsPanel();
        return;
      }

      // Open search: ⌘F / Ctrl+F (intercept browser default)
      if (meta && ev.key.toLowerCase() === 'f') {
        ev.preventDefault();
        openSearch();
        return;
      }

      // Toggle tree: ⌘B / Ctrl+B
      if (meta && ev.key.toLowerCase() === 'b') {
        ev.preventDefault();
        toggleTreeCollapsed();
        return;
      }

      // Toggle outline: ⌘. / Ctrl+.
      if (meta && ev.key === '.') {
        ev.preventDefault();
        toggleOutlineCollapsed();
        return;
      }

      // Toggle theme: ⌘\ / Ctrl+\
      if (meta && ev.key === '\\') {
        ev.preventDefault();
        toggleTheme();
        return;
      }

      // Bare keys — only fire when not typing in an input
      if (typing) return;

      // / → open search
      if (ev.key === '/') {
        ev.preventDefault();
        openSearch();
        return;
      }

      // j → next heading
      if (ev.key === 'j') {
        const ids = flattenIds(outline);
        if (ids.length === 0) return;
        const cur = activeHeadingId.value;
        const idx = cur ? ids.indexOf(cur) : -1;
        const next = ids[Math.min(idx + 1, ids.length - 1)];
        if (next) {
          ev.preventDefault();
          onJumpHeading(next);
        }
        return;
      }

      // k → previous heading
      if (ev.key === 'k') {
        const ids = flattenIds(outline);
        if (ids.length === 0) return;
        const cur = activeHeadingId.value;
        const idx = cur ? ids.indexOf(cur) : ids.length;
        const prev = ids[Math.max(idx - 1, 0)];
        if (prev) {
          ev.preventDefault();
          onJumpHeading(prev);
        }
        return;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [outline, onJumpHeading]);
}
