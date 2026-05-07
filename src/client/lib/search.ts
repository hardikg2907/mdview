import { compilePattern, type SearchOptions, DEFAULT_OPTIONS } from '../../shared/search-pattern.js';

export interface SearchHit {
  node: Text;
  start: number;
  end: number;
}

const MARK_CLASS = 'search-hit';
const ACTIVE_CLASS = 'is-active';

export function clearHighlights(root: HTMLElement): void {
  const marks = root.querySelectorAll(`mark.${MARK_CLASS}`);
  marks.forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
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
  while (current) {
    const text = current.nodeValue ?? '';
    for (const m of pattern.matchAll(text)) {
      hits.push({ node: current as Text, start: m.index, end: m.index + m.length });
    }
    current = walker.nextNode();
  }

  return hits;
}

export function highlightHits(hits: SearchHit[], activeIndex: number): HTMLElement[] {
  const marks: HTMLElement[] = [];
  // Group hits by text node so we can wrap from the end forward (preserves indices).
  const byNode = new Map<Text, SearchHit[]>();
  hits.forEach((h) => {
    const arr = byNode.get(h.node) ?? [];
    arr.push(h);
    byNode.set(h.node, arr);
  });

  // Track which hit-index corresponds to which mark we create.
  const indexOfHit = new Map<SearchHit, number>();
  hits.forEach((h, i) => indexOfHit.set(h, i));

  byNode.forEach((nodeHits, textNode) => {
    nodeHits.sort((a, b) => a.start - b.start);
    let cursor = 0;
    const parent = textNode.parentNode;
    if (!parent) return;
    const frag = document.createDocumentFragment();
    nodeHits.forEach((h) => {
      if (h.start > cursor) {
        frag.appendChild(document.createTextNode(textNode.nodeValue!.slice(cursor, h.start)));
      }
      const mark = document.createElement('mark');
      mark.className = MARK_CLASS;
      const i = indexOfHit.get(h)!;
      if (i === activeIndex) mark.classList.add(ACTIVE_CLASS);
      mark.dataset.hit = String(i);
      mark.textContent = textNode.nodeValue!.slice(h.start, h.end);
      frag.appendChild(mark);
      marks.push(mark);
      cursor = h.end;
    });
    if (cursor < (textNode.nodeValue?.length ?? 0)) {
      frag.appendChild(document.createTextNode(textNode.nodeValue!.slice(cursor)));
    }
    parent.replaceChild(frag, textNode);
  });

  return marks;
}

export function setActiveMark(root: HTMLElement, activeIndex: number): HTMLElement | null {
  const all = root.querySelectorAll<HTMLElement>(`mark.${MARK_CLASS}`);
  let active: HTMLElement | null = null;
  all.forEach((m) => {
    const i = Number(m.dataset.hit ?? -1);
    if (i === activeIndex) {
      m.classList.add(ACTIVE_CLASS);
      active = m;
    } else {
      m.classList.remove(ACTIVE_CLASS);
    }
  });
  return active;
}
