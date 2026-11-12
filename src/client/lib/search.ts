import { compilePattern, DEFAULT_OPTIONS, type SearchOptions } from '../../shared/search-pattern.js';

export interface SearchHit {
  node: Text;
  start: number;
  end: number;
}

const MARK_CLASS = 'search-hit';
const ACTIVE_CLASS = 'is-active';

/**
 * Hard cap on in-document DOM `<mark>` wrappers so broad regexes (e.g. `.` or
 * `\w`) on large documents cannot stall layout with hundreds of thousands of nodes.
 */
export const MAX_DOC_HITS = 5000;

export function clearHighlights(root: HTMLElement): void {
  const marks = root.querySelectorAll(`mark.${MARK_CLASS}`);
  if (marks.length === 0) return;
  const parents = new Set<Node>();
  for (const m of marks) {
    const parent = m.parentNode;
    if (!parent) continue;
    parents.add(parent);
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
  }
  // Normalize each affected parent once instead of per-<mark> (which was O(M^2)
  // when thousands of matches fell inside the same <p> or <pre><code> block).
  for (const parent of parents) {
    parent.normalize();
  }
}

function isInsideMark(node: Node): boolean {
  let n: Node | null = node.parentNode;
  while (n) {
    if (n instanceof HTMLElement && n.tagName === 'MARK' && n.classList.contains(MARK_CLASS)) {
      return true;
    }
    n = n.parentNode;
  }
  return false;
}

export function findHits(
  root: HTMLElement,
  query: string,
  opts: SearchOptions = DEFAULT_OPTIONS,
): SearchHit[] {
  if (!query) return [];
  const pattern = compilePattern(query, opts);
  if (!pattern.valid) return [];
  const hits: SearchHit[] = [];

  // Restrict search to the rendered markdown only — exclude search bar UI,
  // doc-stats, frontmatter block, and our injected widgets.
  const contentRoot = root.querySelector<HTMLElement>('.markdown-content') ?? root;
  const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      if (isInsideMark(node)) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.heading-anchor, .copy-btn, .external-icon, .search-bar')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current: Node | null = walker.nextNode();
  while (current && hits.length < MAX_DOC_HITS) {
    const text = current.nodeValue ?? '';
    for (const m of pattern.matchAll(text)) {
      hits.push({ node: current as Text, start: m.index, end: m.index + m.length });
      if (hits.length >= MAX_DOC_HITS) break;
    }
    current = walker.nextNode();
  }

  return hits;
}

interface IndexedHit {
  start: number;
  end: number;
  index: number;
}

export function highlightHits(hits: SearchHit[], activeIndex: number): HTMLElement[] {
  const marks: HTMLElement[] = [];
  if (hits.length === 0) return marks;

  const limit = Math.min(hits.length, MAX_DOC_HITS);
  const byNode = new Map<Text, IndexedHit[]>();
  for (let i = 0; i < limit; i++) {
    const h = hits[i]!;
    let arr = byNode.get(h.node);
    if (!arr) {
      arr = [];
      byNode.set(h.node, arr);
    }
    arr.push({ start: h.start, end: h.end, index: i });
  }

  for (const [textNode, nodeHits] of byNode) {
    const parent = textNode.parentNode;
    if (!parent) continue;
    const raw = textNode.nodeValue ?? '';
    if (nodeHits.length > 1) {
      nodeHits.sort((a, b) => a.start - b.start);
    }
    let cursor = 0;
    const frag = document.createDocumentFragment();
    for (const h of nodeHits) {
      if (h.start > cursor) {
        frag.appendChild(document.createTextNode(raw.slice(cursor, h.start)));
      }
      const mark = document.createElement('mark');
      mark.className = h.index === activeIndex ? `${MARK_CLASS} ${ACTIVE_CLASS}` : MARK_CLASS;
      mark.dataset.hit = String(h.index);
      mark.textContent = raw.slice(h.start, h.end);
      frag.appendChild(mark);
      marks.push(mark);
      cursor = h.end;
    }
    if (cursor < raw.length) {
      frag.appendChild(document.createTextNode(raw.slice(cursor)));
    }
    parent.replaceChild(frag, textNode);
  }

  return marks;
}

export function setActiveMark(root: HTMLElement, activeIndex: number): HTMLElement | null {
  const prev = root.querySelectorAll<HTMLElement>(`mark.${MARK_CLASS}.${ACTIVE_CLASS}`);
  for (const m of prev) {
    if (Number(m.dataset.hit ?? -1) !== activeIndex) {
      m.classList.remove(ACTIVE_CLASS);
    }
  }
  const next = root.querySelector<HTMLElement>(
    `mark.${MARK_CLASS}[data-hit="${activeIndex}"]`,
  );
  if (next) next.classList.add(ACTIVE_CLASS);
  return next;
}
