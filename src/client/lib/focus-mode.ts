const DIM = 'is-dimmed';
const ACTIVE = 'is-focused';

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

function levelOf(el: Element): number {
  return Number(el.tagName[1]);
}

function clearMarks(root: HTMLElement): void {
  root.querySelectorAll(`.${DIM}, .${ACTIVE}`).forEach((el) => {
    el.classList.remove(DIM, ACTIVE);
  });
}

/**
 * Apply focus-mode dimming to the rendered markdown content. The "section" of
 * the active heading runs from the heading itself up to (but not including)
 * the next heading at the same or shallower level.
 *
 * Idempotent: clears any prior `is-dimmed` / `is-focused` markers before
 * reapplying. Safe to call repeatedly on heading change.
 */
export function applyFocus(root: HTMLElement, activeId: string | null): void {
  clearMarks(root);
  if (!activeId) return;
  const heading = root.querySelector<HTMLElement>(`#${CSS.escape(activeId)}`);
  if (!heading || !HEADING_TAGS.has(heading.tagName)) return;

  const activeLevel = levelOf(heading);
  // Walk siblings of the heading's parent block — the markdown is rendered as
  // a flat sequence of children of `.markdown-content`.
  const content = heading.closest('.markdown-content') ?? root;
  const blocks = Array.from(content.children) as HTMLElement[];
  const startIdx = blocks.indexOf(heading);
  if (startIdx < 0) return;

  // Find the end: the next heading whose level <= activeLevel.
  let endIdx = blocks.length;
  for (let i = startIdx + 1; i < blocks.length; i++) {
    const el = blocks[i]!;
    if (HEADING_TAGS.has(el.tagName) && levelOf(el) <= activeLevel) {
      endIdx = i;
      break;
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    const el = blocks[i]!;
    if (i >= startIdx && i < endIdx) {
      el.classList.add(ACTIVE);
    } else {
      el.classList.add(DIM);
    }
  }
}

export function clearFocus(root: HTMLElement): void {
  clearMarks(root);
}
