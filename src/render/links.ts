import path from 'node:path/posix';
import { type HtmlAttr, type HtmlTag, rewriteTags } from './html-tags.js';

const MD_EXT_RE = /\.(md|markdown|mdx)$/i;
const ANCHOR = new Set(['a']);
const IMG = new Set(['img']);

const ENTITY: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function unescapeHtml(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITY[e] ?? e);
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);
}

function firstAttr(tag: HtmlTag, name: string): HtmlAttr | undefined {
  return tag.attrs.find((a) => a.name === name);
}

/** Split an href into path, `?query` and `#hash`; the query ends at the first `#`. */
function splitHref(href: string): { target: string; query?: string; hash?: string } {
  const q = href.indexOf('?');
  const h = href.indexOf('#');
  if (h >= 0 && (q < 0 || h < q)) return { target: href.slice(0, h), hash: href.slice(h) };
  if (q < 0) return { target: href };
  if (h < 0) return { target: href.slice(0, q), query: href.slice(q) };
  return { target: href.slice(0, q), query: href.slice(q, h), hash: href.slice(h) };
}

export function tagInternalLinks(html: string, currentRelPath: string): string {
  const currentDir = path.dirname(currentRelPath);
  return rewriteTags(html, ANCHOR, (tag) => {
    const attr = firstAttr(tag, 'href');
    if (!attr?.value) return null;
    const { target: rawTarget, query: rawQuery, hash: rawHash } = splitHref(attr.value);
    if (!rawTarget || /^https?:\/\//i.test(rawTarget) || rawTarget.startsWith('mailto:')) {
      return null;
    }
    if (!MD_EXT_RE.test(rawTarget)) return null;

    // The attribute is still HTML-escaped. Unescape it to get the URL, and
    // escape everything on the way back out: decodeURIComponent turns `%22`
    // into a raw quote that would otherwise close the attribute.
    const target = unescapeHtml(rawTarget);
    const query = rawQuery === undefined ? undefined : unescapeHtml(rawQuery);
    const hash = rawHash === undefined ? undefined : unescapeHtml(rawHash);
    const resolved = path.normalize(path.join(currentDir, target));
    let decoded: string;
    try {
      decoded = decodeURIComponent(resolved);
    } catch {
      decoded = resolved;
    }
    // href points at the SPA's ?file= entrypoint so cmd/ctrl+click opens the
    // correct file in a new tab directly — no server redirect roundtrip, and
    // the URL bar shows the right URL immediately on tab open.
    const href = `?file=${encodeURIComponent(decoded)}${hash ?? ''}`;
    const internal = `${decoded}${query ?? ''}${hash ?? ''}`;
    return (
      html.slice(tag.start, attr.start) +
      `href="${escapeAttr(href)}" data-internal-link="${escapeAttr(internal)}"` +
      html.slice(attr.end, tag.end)
    );
  });
}

export function rewriteImageSrc(html: string, currentRelPath: string): string {
  const currentDir = path.dirname(currentRelPath);
  return rewriteTags(html, IMG, (tag) => {
    const attr = firstAttr(tag, 'src');
    const src = attr?.value;
    if (!attr || !src) return null;
    if (/^(https?:\/\/|data:|\/__asset\/)/i.test(src)) return null;
    const trimmed = src.replace(/^\/+/, '');
    const resolved = path.normalize(path.join(currentDir, trimmed));
    if (resolved.startsWith('..')) return null;
    // The value keeps its HTML escaping, so only a quote from a single-quoted
    // or unquoted source needs escaping to sit inside double quotes.
    return (
      html.slice(tag.start, attr.start) +
      `src="/__asset/${resolved.replaceAll('"', '&quot;')}"` +
      html.slice(attr.end, tag.end)
    );
  });
}
