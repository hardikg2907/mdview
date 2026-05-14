import { currentPathSignal } from '../hooks/usePathRouting.js';
import type { Wire } from './wire-pipeline.js';

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const TOGGLE_CLASS = 'section-toggle';
const HEADING_COLLAPSED_CLASS = 'section-heading-collapsed';
const HIDDEN_BY_ATTR = 'data-section-collapsed-by';

const collapsedIds = new Set<string>();
let lastPath: string | null | undefined;
let activeRoot: HTMLElement | null = null;
let printListenersAttached = false;

function levelOf(el: Element): number {
  return Number(el.tagName[1]);
}

function isHeadingElement(el: Element | null | undefined): el is HTMLHeadingElement {
  return !!el && HEADING_TAGS.has(el.tagName);
}

/**
 * Given the flat block sequence of `.markdown-content` and the index of a
 * heading inside it, return the exclusive-end index of that heading's section
 * — the run of trailing siblings up to the next heading of equal-or-shallower
 * level. Returns `null` if the index isn't a heading.
 */
export function computeSectionEnd(
  blocks: readonly HTMLElement[],
  headingIdx: number,
): number | null {
  const heading = blocks[headingIdx];
  if (!heading || !HEADING_TAGS.has(heading.tagName)) return null;
  const level = levelOf(heading);
  for (let i = headingIdx + 1; i < blocks.length; i++) {
    const el = blocks[i]!;
    if (HEADING_TAGS.has(el.tagName) && levelOf(el) <= level) return i;
  }
  return blocks.length;
}

function getBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children) as HTMLElement[];
}

function findTopLevelHeadings(root: HTMLElement): HTMLHeadingElement[] {
  return getBlocks(root).filter(
    (el): el is HTMLHeadingElement => isHeadingElement(el) && !!el.id,
  );
}

function setHeadingState(
  root: HTMLElement,
  heading: HTMLHeadingElement,
  collapsed: boolean,
): void {
  const blocks = getBlocks(root);
  const idx = blocks.indexOf(heading);
  if (idx < 0) return;
  const end = computeSectionEnd(blocks, idx);
  if (end === null) return;

  const btn = heading.querySelector<HTMLButtonElement>(`button.${TOGGLE_CLASS}`);
  if (btn) {
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section');
    btn.title = collapsed ? 'Expand section' : 'Collapse section';
  }
  heading.classList.toggle(HEADING_COLLAPSED_CLASS, collapsed);

  for (let i = idx + 1; i < end; i++) {
    const el = blocks[i]!;
    if (collapsed) {
      // Only hide elements we haven't already hidden, and only if not already
      // hidden by something outside our control (so we don't fight other code).
      if (!el.hasAttribute('hidden')) {
        el.setAttribute('hidden', '');
        el.setAttribute(HIDDEN_BY_ATTR, heading.id);
      }
    } else if (el.getAttribute(HIDDEN_BY_ATTR) === heading.id) {
      el.removeAttribute('hidden');
      el.removeAttribute(HIDDEN_BY_ATTR);
    }
  }
}

function toggleHeading(root: HTMLElement, heading: HTMLHeadingElement): void {
  const id = heading.id;
  const willCollapse = !collapsedIds.has(id);
  if (willCollapse) collapsedIds.add(id);
  else collapsedIds.delete(id);
  setHeadingState(root, heading, willCollapse);
}

function setAll(root: HTMLElement, collapsed: boolean): void {
  for (const h of findTopLevelHeadings(root)) {
    if (collapsed) collapsedIds.add(h.id);
    else collapsedIds.delete(h.id);
    setHeadingState(root, h, collapsed);
  }
}

export function expandAll(): void {
  if (!activeRoot) return;
  setAll(activeRoot, false);
}

export function collapseAll(): void {
  if (!activeRoot) return;
  setAll(activeRoot, true);
}

/**
 * If `target` lives inside any currently-collapsed section, expand that
 * section so the element becomes visible. Call before scrolling to a search
 * match or any non-id-addressable element.
 */
export function expandSectionContainingElement(target: Element | null): void {
  if (!activeRoot || collapsedIds.size === 0 || !target) return;
  if (!activeRoot.contains(target)) return;

  const blocks = getBlocks(activeRoot);
  for (let idx = 0; idx < blocks.length; idx++) {
    const heading = blocks[idx]!;
    if (!isHeadingElement(heading) || !heading.id) continue;
    if (!collapsedIds.has(heading.id)) continue;
    const end = computeSectionEnd(blocks, idx);
    if (end === null) continue;
    for (let i = idx + 1; i < end; i++) {
      const block = blocks[i]!;
      if (block === target || block.contains(target)) {
        collapsedIds.delete(heading.id);
        setHeadingState(activeRoot, heading, false);
        break;
      }
    }
  }
}

/**
 * Same as `expandSectionContainingElement` but takes an id. `getElementById`
 * is safe for any user-supplied id (no selector parsing).
 */
export function expandSectionContaining(id: string): void {
  if (!id) return;
  expandSectionContainingElement(document.getElementById(id));
}

function makeToggleButton(root: HTMLElement, heading: HTMLHeadingElement): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = TOGGLE_CLASS;
  btn.setAttribute('aria-expanded', 'true');
  btn.setAttribute('aria-label', 'Collapse section');
  btn.title = 'Collapse section';
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    toggleHeading(root, heading);
  });
  return btn;
}

let printSnapshot: string[] | null = null;
function onBeforePrint(): void {
  if (!activeRoot) return;
  // Don't clobber an in-flight snapshot — some browsers fire `beforeprint`
  // twice if the user dismisses and re-opens the print dialog before
  // `afterprint` resolves. Without this guard the second snapshot would be
  // the now-empty `collapsedIds` and `afterprint` would restore nothing.
  if (printSnapshot !== null) return;
  printSnapshot = [...collapsedIds];
  setAll(activeRoot, false);
}
function onAfterPrint(): void {
  if (!activeRoot || !printSnapshot) return;
  // Re-apply the snapshot exactly: collapse those that were collapsed, leave
  // the rest alone.
  for (const id of printSnapshot) {
    collapsedIds.add(id);
    const h = document.getElementById(id);
    if (h && isHeadingElement(h) && activeRoot.contains(h)) {
      setHeadingState(activeRoot, h as HTMLHeadingElement, true);
    }
  }
  printSnapshot = null;
}

function attachPrintListeners(): void {
  if (printListenersAttached) return;
  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);
  printListenersAttached = true;
}

function detachPrintListeners(): void {
  if (!printListenersAttached) return;
  window.removeEventListener('beforeprint', onBeforePrint);
  window.removeEventListener('afterprint', onAfterPrint);
  printListenersAttached = false;
}

export const wireCollapsibleSections: Wire = {
  name: 'collapsible-sections',
  run: (root) => {
    activeRoot = root;

    // File-identity reset: clear collapsed state on path change. Same-file live
    // reloads (path unchanged) preserve state.
    const path = currentPathSignal.value;
    if (path !== lastPath) {
      collapsedIds.clear();
      lastPath = path;
    }

    const headings = findTopLevelHeadings(root);

    for (const h of headings) {
      if (!h.querySelector(`button.${TOGGLE_CLASS}`)) {
        h.insertBefore(makeToggleButton(root, h), h.firstChild);
      }
    }

    // Drop orphaned ids whose headings no longer exist (live reload edited the
    // doc and removed/renamed headings we had collapsed).
    const present = new Set(headings.map((h) => h.id));
    for (const id of [...collapsedIds]) {
      if (!present.has(id)) collapsedIds.delete(id);
    }

    // Re-apply collapsed state after live reload (innerHTML wiped prior state).
    for (const h of headings) {
      setHeadingState(root, h, collapsedIds.has(h.id));
    }

    // Print snapshot/restore — register once at module scope so re-runs
    // of the wire don't pile listeners onto window.
    attachPrintListeners();
  },
};

// Test-only reset hook. Not exported from `wires.ts` and not used at runtime.
export function __resetCollapsibleStateForTests(): void {
  collapsedIds.clear();
  lastPath = undefined;
  activeRoot = null;
  printSnapshot = null;
  detachPrintListeners();
}
