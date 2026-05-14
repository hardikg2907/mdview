import type { OutlineNode } from '../shared/types.js';
import {
  toggleTreeCollapsed,
  toggleOutlineCollapsed,
  toggleFocusMode,
  toggleMinimap,
  toggleWideLayout,
} from './hooks/useUiState.js';
import { toggleTheme } from './hooks/useTheme.js';
import { openSearch } from './hooks/useSearch.js';
import { openShortcutsPanel } from './hooks/useShortcutsPanel.js';
import { openPalette } from './hooks/useCommandPalette.js';
import { activeHeadingId } from './hooks/useScrollSpy.js';
import { mainScrollerSignal } from './hooks/useScroller.js';
import { currentPathSignal } from './hooks/usePathRouting.js';
import { treeSignal } from './hooks/useTree.js';
import { flattenMdFiles } from './lib/file-search.js';
import { flattenHeadings, nextSameLevelHeading } from './lib/outline-nav.js';
import { expandAll, collapseAll } from './lib/collapsible-sections.js';

export interface ShortcutContext {
  outline: OutlineNode[];
  onJumpHeading: (id: string) => void;
  navigate: (relPath: string) => void;
}

export type ShortcutGroup = 'Navigation' | 'Find' | 'View';

export interface Shortcut {
  id: string;
  group: ShortcutGroup;
  /** Human-readable description shown in the panel. */
  label: string;
  /** Keys shown in the panel (in display order, joined by `+`). */
  displayKeys: string[];
  /** Whether the shortcut should fire when the focus is in an input/textarea. */
  whenTyping?: 'allow' | 'block';
  /** Predicate over the keyboard event. */
  match: (ev: KeyboardEvent) => boolean;
  /** Effect to run when matched. */
  run: (ctx: ShortcutContext) => void;
}

const isMac =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);
const Mod = isMac ? '⌘' : 'Ctrl';

function meta(ev: KeyboardEvent): boolean {
  return ev.metaKey || ev.ctrlKey;
}

function nextHeading(ctx: ShortcutContext, dir: 1 | -1): void {
  const ids = flattenHeadings(ctx.outline).map((h) => h.id);
  if (ids.length === 0) return;
  const cur = activeHeadingId.value;
  if (dir === 1) {
    const idx = cur ? ids.indexOf(cur) : -1;
    const next = ids[Math.min(idx + 1, ids.length - 1)];
    if (next) ctx.onJumpHeading(next);
  } else {
    const idx = cur ? ids.indexOf(cur) : ids.length;
    const prev = ids[Math.max(idx - 1, 0)];
    if (prev) ctx.onJumpHeading(prev);
  }
}

function siblingFile(dir: 1 | -1): string | null {
  const tree = treeSignal.value;
  if (!tree) return null;
  const files = flattenMdFiles(tree.tree);
  if (files.length === 0) return null;
  const cur = currentPathSignal.value;
  const idx = cur ? files.findIndex((f) => f.relPath === cur) : -1;
  if (idx < 0) return files[0]?.relPath ?? null;
  const next = idx + dir;
  if (next < 0 || next >= files.length) return null;
  return files[next]!.relPath;
}

function scrollByHalfPage(dir: 1 | -1): void {
  const el = mainScrollerSignal.value;
  if (!el) return;
  el.scrollBy({ top: dir * (el.clientHeight / 2), behavior: 'smooth' });
}

// Track double-key sequences (e.g. `gg`).
let pendingGAt = 0;
const G_WINDOW_MS = 600;

export const shortcuts: Shortcut[] = [
  // ===== Find =====
  {
    id: 'palette',
    group: 'Find',
    label: 'Switch file (quick switcher)',
    displayKeys: [Mod, 'P'],
    whenTyping: 'allow',
    match: (ev) => meta(ev) && ev.key.toLowerCase() === 'p',
    run: () => openPalette(),
  },
  {
    id: 'search-doc-meta',
    group: 'Find',
    label: 'Open in-doc search',
    displayKeys: [Mod, 'F'],
    whenTyping: 'allow',
    match: (ev) => meta(ev) && !ev.shiftKey && ev.key.toLowerCase() === 'f',
    run: () => openSearch('doc'),
  },
  {
    id: 'search-folder-meta',
    group: 'Find',
    label: 'Open folder-wide search',
    displayKeys: [Mod, '⇧', 'F'],
    whenTyping: 'allow',
    match: (ev) => meta(ev) && ev.shiftKey && ev.key.toLowerCase() === 'f',
    run: () => openSearch('folder'),
  },
  {
    id: 'search-doc-slash',
    group: 'Find',
    label: 'Open search (no modifier)',
    displayKeys: ['/'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && ev.key === '/',
    run: () => openSearch('doc'),
  },

  // ===== View =====
  {
    id: 'shortcuts-panel',
    group: 'View',
    label: 'Show shortcuts panel',
    displayKeys: ['?'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && ev.key === '?',
    run: () => openShortcutsPanel(),
  },
  {
    id: 'toggle-tree',
    group: 'View',
    label: 'Toggle file tree',
    displayKeys: [Mod, 'B'],
    whenTyping: 'allow',
    match: (ev) => meta(ev) && ev.key.toLowerCase() === 'b',
    run: () => toggleTreeCollapsed(),
  },
  {
    id: 'toggle-outline',
    group: 'View',
    label: 'Toggle outline',
    displayKeys: [Mod, '.'],
    whenTyping: 'allow',
    match: (ev) => meta(ev) && ev.key === '.',
    run: () => toggleOutlineCollapsed(),
  },
  {
    id: 'toggle-theme',
    group: 'View',
    label: 'Toggle theme',
    displayKeys: [Mod, '\\'],
    whenTyping: 'allow',
    match: (ev) => meta(ev) && ev.key === '\\',
    run: () => toggleTheme(),
  },
  {
    id: 'toggle-focus',
    group: 'View',
    label: 'Toggle focus mode',
    displayKeys: ['f'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && !ev.shiftKey && ev.key === 'f',
    run: () => toggleFocusMode(),
  },
  {
    id: 'toggle-minimap',
    group: 'View',
    label: 'Toggle minimap',
    displayKeys: ['m'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && !ev.shiftKey && ev.key === 'm',
    run: () => toggleMinimap(),
  },
  {
    id: 'toggle-wide-layout',
    group: 'View',
    label: 'Toggle wide layout',
    displayKeys: ['w'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && !ev.shiftKey && ev.key === 'w',
    run: () => toggleWideLayout(),
  },
  {
    id: 'expand-all-sections',
    group: 'View',
    label: 'Expand all sections',
    displayKeys: ['e'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && !ev.shiftKey && ev.key === 'e',
    run: () => expandAll(),
  },
  {
    id: 'collapse-all-sections',
    group: 'View',
    label: 'Collapse all sections',
    displayKeys: ['⇧', 'E'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && ev.shiftKey && ev.key === 'E',
    run: () => collapseAll(),
  },

  // ===== Navigation =====
  {
    id: 'next-heading',
    group: 'Navigation',
    label: 'Next heading',
    displayKeys: ['j'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && ev.key === 'j',
    run: (ctx) => nextHeading(ctx, 1),
  },
  {
    id: 'prev-heading',
    group: 'Navigation',
    label: 'Previous heading',
    displayKeys: ['k'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && ev.key === 'k',
    run: (ctx) => nextHeading(ctx, -1),
  },
  {
    id: 'doc-top',
    group: 'Navigation',
    label: 'Top of document (gg)',
    displayKeys: ['g', 'g'],
    whenTyping: 'block',
    match: (ev) => {
      if (meta(ev) || ev.shiftKey) return false;
      if (ev.key !== 'g') return false;
      const now = performance.now();
      const wasPending = now - pendingGAt < G_WINDOW_MS;
      if (wasPending) {
        pendingGAt = 0;
        return true;
      }
      pendingGAt = now;
      return false;
    },
    run: () => {
      const el = mainScrollerSignal.value;
      if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
    },
  },
  {
    id: 'doc-bottom',
    group: 'Navigation',
    label: 'Bottom of document',
    displayKeys: ['⇧', 'G'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && ev.shiftKey && ev.key === 'G',
    run: () => {
      const el = mainScrollerSignal.value;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    },
  },
  {
    id: 'next-file',
    group: 'Navigation',
    label: 'Next file',
    displayKeys: ['⇧', 'L'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && ev.shiftKey && ev.key === 'L',
    run: (ctx) => {
      const next = siblingFile(1);
      if (next) ctx.navigate(next);
    },
  },
  {
    id: 'prev-file',
    group: 'Navigation',
    label: 'Previous file',
    displayKeys: ['⇧', 'H'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && ev.shiftKey && ev.key === 'H',
    run: (ctx) => {
      const prev = siblingFile(-1);
      if (prev) ctx.navigate(prev);
    },
  },
  {
    id: 'next-same-level',
    group: 'Navigation',
    label: 'Next heading at same level',
    displayKeys: [']'],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && ev.key === ']',
    run: (ctx) => {
      const next = nextSameLevelHeading(ctx.outline, activeHeadingId.value, 1);
      if (next) ctx.onJumpHeading(next);
    },
  },
  {
    id: 'prev-same-level',
    group: 'Navigation',
    label: 'Previous heading at same level',
    displayKeys: ['['],
    whenTyping: 'block',
    match: (ev) => !meta(ev) && ev.key === '[',
    run: (ctx) => {
      const prev = nextSameLevelHeading(ctx.outline, activeHeadingId.value, -1);
      if (prev) ctx.onJumpHeading(prev);
    },
  },
  {
    id: 'half-page-down',
    group: 'Navigation',
    label: 'Half page down',
    displayKeys: ['Ctrl', 'D'],
    whenTyping: 'block',
    // Use ctrlKey explicitly (not meta), so it works on macOS without ⌘ collision.
    match: (ev) => ev.ctrlKey && !ev.metaKey && !ev.shiftKey && ev.key.toLowerCase() === 'd',
    run: () => scrollByHalfPage(1),
  },
  {
    id: 'half-page-up',
    group: 'Navigation',
    label: 'Half page up',
    displayKeys: ['Ctrl', 'U'],
    whenTyping: 'block',
    match: (ev) => ev.ctrlKey && !ev.metaKey && !ev.shiftKey && ev.key.toLowerCase() === 'u',
    run: () => scrollByHalfPage(-1),
  },
];

/** Display-only entries (no global handler — handled inside specific overlays). */
export const displayOnlyShortcuts: Shortcut[] = [
  {
    id: 'esc-close',
    group: 'Navigation',
    label: 'Close search / lightbox / panel',
    displayKeys: ['Esc'],
    match: () => false,
    run: () => {},
  },
  {
    id: 'enter-next',
    group: 'Find',
    label: 'Next match (in search)',
    displayKeys: ['Enter'],
    match: () => false,
    run: () => {},
  },
  {
    id: 'shift-enter-prev',
    group: 'Find',
    label: 'Previous match (in search)',
    displayKeys: ['⇧', 'Enter'],
    match: () => false,
    run: () => {},
  },
];

/**
 * Reset any pending sequence state. Called by the dispatcher when a key arrives
 * that doesn't continue a sequence — keeps `gg` from gluing to a later `g`.
 */
export function resetPendingSequences(ev: KeyboardEvent): void {
  // If user types `g` then anything other than `g`, drop the pending state.
  if (ev.key !== 'g') pendingGAt = 0;
}
