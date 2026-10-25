// Tag scanning for rendered and raw HTML. Every function here walks its input
// once, front to back, and never rescans: the input is a whole document, and a
// backtracking regex over it (`<a\s+[^>]*?href=…`) restarts at every `<a`,
// which turns a few hundred KB of `<a <a <a …` into minutes of CPU.

export interface HtmlAttr {
  /** Lower-cased. */
  name: string;
  /** Raw text between the quotes (entities still escaped); null for a bare name. */
  value: string | null;
  /** Span of the whole attribute, name through closing quote. */
  start: number;
  end: number;
}

export interface HtmlTag {
  /** Lower-cased. */
  name: string;
  /** Offset of `<`. */
  start: number;
  /** Offset just past `>`. */
  end: number;
  attrs: HtmlAttr[];
}

function isSpace(c: number): boolean {
  // HTML whitespace: tab, LF, FF, CR, space.
  return c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
}

function isAsciiAlpha(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

const GT = 62;
const SLASH = 47;
const EQ = 61;

function nameEnd(html: string, from: number): number {
  let j = from;
  while (j < html.length) {
    const c = html.charCodeAt(j);
    if (isSpace(c) || c === SLASH || c === GT) break;
    j++;
  }
  return j;
}

/**
 * Read the attributes of a tag whose name ends at `from`, the way an HTML
 * tokenizer does: a `>` inside a quoted value does not end the tag. Returns
 * the offset just past `>`, or -1 when the input ends first. Attributes are
 * collected only when `attrs` is given.
 */
function readAttrs(html: string, from: number, attrs: HtmlAttr[] | null): number {
  const n = html.length;
  let j = from;
  for (;;) {
    while (j < n && (isSpace(html.charCodeAt(j)) || html.charCodeAt(j) === SLASH)) j++;
    if (j >= n) return -1;
    if (html.charCodeAt(j) === GT) return j + 1;

    const nameStart = j;
    j++;
    while (j < n) {
      const c = html.charCodeAt(j);
      if (isSpace(c) || c === SLASH || c === GT || c === EQ) break;
      j++;
    }
    const nameStop = j;
    let k = j;
    while (k < n && isSpace(html.charCodeAt(k))) k++;
    if (k >= n || html.charCodeAt(k) !== EQ) {
      attrs?.push({
        name: html.slice(nameStart, nameStop).toLowerCase(),
        value: null,
        start: nameStart,
        end: nameStop,
      });
      j = k;
      continue;
    }
    k++;
    while (k < n && isSpace(html.charCodeAt(k))) k++;
    if (k >= n) return -1;
    const q = html[k];
    let valueStart: number;
    let valueEnd: number;
    if (q === '"' || q === "'") {
      valueStart = k + 1;
      valueEnd = html.indexOf(q, valueStart);
      if (valueEnd < 0) return -1;
      j = valueEnd + 1;
    } else {
      valueStart = k;
      while (k < n && !isSpace(html.charCodeAt(k)) && html.charCodeAt(k) !== GT) k++;
      valueEnd = k;
      j = k;
    }
    attrs?.push({
      name: html.slice(nameStart, nameStop).toLowerCase(),
      value: html.slice(valueStart, valueEnd),
      start: nameStart,
      end: j,
    });
  }
}

/**
 * Replace start tags named in `names`. `rewrite` returns the new text for the
 * whole tag, or null to keep it. Comments and the attributes of every other tag
 * are stepped over, so a `<a` inside them is not mistaken for a tag. From a tag
 * or comment that never closes to the end, the input passes through untouched.
 */
export function rewriteTags(
  html: string,
  names: ReadonlySet<string>,
  rewrite: (tag: HtmlTag) => string | null,
): string {
  const out: string[] = [];
  let copied = 0;
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    const c1 = html.charCodeAt(lt + 1);

    if (isAsciiAlpha(c1)) {
      const ne = nameEnd(html, lt + 1);
      const name = html.slice(lt + 1, ne).toLowerCase();
      const wanted = names.has(name);
      const attrs: HtmlAttr[] | null = wanted ? [] : null;
      const end = readAttrs(html, ne, attrs);
      if (end < 0) break;
      if (wanted) {
        const replaced = rewrite({ name, start: lt, end, attrs: attrs as HtmlAttr[] });
        if (replaced !== null) {
          out.push(html.slice(copied, lt), replaced);
          copied = end;
        }
      }
      i = end;
      continue;
    }

    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      if (close < 0) break;
      i = close + 3;
      continue;
    }

    if (c1 === SLASH && isAsciiAlpha(html.charCodeAt(lt + 2))) {
      // End tags carry (ignored) attributes, and quotes in them still count.
      const end = readAttrs(html, nameEnd(html, lt + 2), null);
      if (end < 0) break;
      i = end;
      continue;
    }

    if (c1 === SLASH || c1 === 33 /* ! */ || c1 === 63 /* ? */) {
      // Declarations, processing instructions and malformed end tags run to the next `>`.
      const close = html.indexOf('>', lt + 2);
      if (close < 0) break;
      i = close + 1;
      continue;
    }

    i = lt + 1;
  }
  if (copied === 0) return html;
  out.push(html.slice(copied));
  return out.join('');
}
