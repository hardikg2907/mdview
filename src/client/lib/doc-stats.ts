import type { OutlineNode } from '../../shared/types.js';

export interface DocStats {
  words: number;
  readingMinutes: number;
  headings: number;
}

const WPM = 225;

export function countHeadings(nodes: OutlineNode[]): number {
  let n = 0;
  for (const node of nodes) {
    n += 1 + countHeadings(node.children);
  }
  return n;
}

export function computeDocStats(html: string, outline: OutlineNode[]): DocStats {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = (tmp.textContent ?? '').trim();
  const words = text.length === 0 ? 0 : text.split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(words / WPM));
  const headings = countHeadings(outline);
  return { words, readingMinutes, headings };
}

export function formatStats(stats: DocStats): string {
  const w = stats.words.toLocaleString();
  const h = stats.headings;
  const m = stats.readingMinutes;
  return `${m} min read · ${w} word${stats.words === 1 ? '' : 's'} · ${h} heading${h === 1 ? '' : 's'}`;
}
