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

function hasNameAt(s: string, at: number, name: string): boolean {
  for (let k = 0; k < name.length; k++) {
    // `| 32` lower-cases an ASCII letter and maps nothing else onto one.
    if ((s.charCodeAt(at + k) | 32) !== name.charCodeAt(k)) return false;
  }
  return true;
}

const STRIPPED = ['meta', 'base'];
const HAS_STRIPPED = /<(?:meta|base)/i;
// A `<` followed by a prefix of a stripped name, at the very end of the output.
const DANGLING_PREFIX = /<(?:m(?:e(?:ta?)?)?|b(?:a(?:se?)?)?)?$/i;

/** Remove and return the last `count` characters of `out`, which holds no empty chunks. */
function popChars(out: string[], count: number): string {
  let taken = '';
  while (taken.length < count && out.length > 0) {
    const last = out.pop() as string;
    const need = count - taken.length;
    if (last.length > need) {
      out.push(last.slice(0, last.length - need));
      taken = last.slice(last.length - need) + taken;
    } else {
      taken = last + taken;
    }
  }
  return taken;
}

/**
 * Remove every `<meta>` and `<base>` start tag from a raw HTML fragment.
 *
 * Deliberately context-free: a fragment is one piece of a larger document, so
 * whether a given `<meta` sits in text or inside a quoted attribute depends on
 * pieces this function cannot see. Every occurrence goes, wherever it is. A tag
 * that never closes takes the rest of the fragment with it.
 */
export function stripMetaAndBase(fragment: string): string {
  if (!HAS_STRIPPED.test(fragment)) return fragment;

  const out: string[] = [];
  let i = 0;
  const n = fragment.length;
  while (i < n) {
    const lt = fragment.indexOf('<', i);
    if (lt < 0) break;
    const after = lt + 5;
    const c = fragment.charCodeAt(after);
    const isTarget =
      STRIPPED.some((name) => hasNameAt(fragment, lt + 1, name)) &&
      (after >= n || isSpace(c) || c === SLASH || c === GT);
    if (!isTarget) {
      out.push(fragment.slice(i, lt + 1));
      i = lt + 1;
      continue;
    }
    if (lt > i) out.push(fragment.slice(i, lt));
    const end = readAttrs(fragment, after, null);
    i = end < 0 ? n : end;
    // Cutting a tag out joins what was on either side of it: `<<meta>meta x>`
    // would come out as `<meta x>`. A `<` left hanging before the cut becomes
    // text, so no tag name can form across the gap.
    const tail = popChars(out, 5);
    const dangling = DANGLING_PREFIX.exec(tail);
    if (dangling) {
      out.push(`${tail.slice(0, dangling.index)}&lt;${tail.slice(dangling.index + 1)}`);
    } else if (tail) {
      out.push(tail);
    }
  }
  if (i < n) out.push(fragment.slice(i));
  return out.join('');
}
