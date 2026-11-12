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

function isUnicodeSpace(code: number): boolean {
  if (code === 32 || (code >= 9 && code <= 13)) return true;
  if (code < 160) return false;
  return (
    code === 0x00a0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

function isWhitespaceEntity(html: string, ampIdx: number, semiIdx: number): boolean {
  const body = html.slice(ampIdx + 1, semiIdx).toLowerCase();
  if (body === 'nbsp' || body === 'ensp' || body === 'emsp' || body === 'thinsp') return true;
  if (body.startsWith('#x')) {
    const code = Number.parseInt(body.slice(2), 16);
    return Number.isFinite(code) && isUnicodeSpace(code);
  }
  if (body.startsWith('#')) {
    const code = Number.parseInt(body.slice(1), 10);
    return Number.isFinite(code) && isUnicodeSpace(code);
  }
  return false;
}

function skipTagOrComment(html: string, ltIdx: number): number {
  const len = html.length;
  if (html.startsWith('<!--', ltIdx)) {
    const end = html.indexOf('-->', ltIdx + 4);
    return end === -1 ? len : end + 3;
  }
  let i = ltIdx + 1;
  let quote = 0;
  while (i < len) {
    const ch = html.charCodeAt(i);
    if (quote !== 0) {
      if (ch === quote) quote = 0;
    } else if (ch === 34 || ch === 39) {
      quote = ch;
    } else if (ch === 62 /* > */) {
      return i + 1;
    }
    i++;
  }
  return len;
}

/**
 * Counts rendered words directly from sanitized HTML without parsing into a
 * detached `<template>` DOM tree (which cost ~57 ms on 70 KB Shiki-highlighted docs).
 */
export function countWordsInHtml(html: string): number {
  const len = html.length;
  let words = 0;
  let inWord = false;
  let i = 0;

  while (i < len) {
    const ch = html.charCodeAt(i);
    if (ch === 60 /* < */) {
      i = skipTagOrComment(html, i);
      continue;
    }
    if (ch === 38 /* & */) {
      const limit = Math.min(len, i + 12);
      let semi = -1;
      for (let j = i + 1; j < limit; j++) {
        const cj = html.charCodeAt(j);
        if (cj === 59 /* ; */) {
          semi = j;
          break;
        }
        if (cj === 38 || cj === 60 || isUnicodeSpace(cj)) break;
      }
      if (semi !== -1) {
        if (isWhitespaceEntity(html, i, semi)) {
          inWord = false;
        } else if (!inWord) {
          words++;
          inWord = true;
        }
        i = semi + 1;
        continue;
      }
    }
    if (isUnicodeSpace(ch)) {
      inWord = false;
    } else if (!inWord) {
      words++;
      inWord = true;
    }
    i++;
  }

  return words;
}

export function computeDocStats(html: string, outline: OutlineNode[]): DocStats {
  const words = countWordsInHtml(html);
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
