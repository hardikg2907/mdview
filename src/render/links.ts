import path from 'node:path/posix';

const MD_EXT_RE = /\.(md|markdown|mdx)$/i;
const HREF_RE = /<a\s+([^>]*?)href="([^"#?]*)(\?[^"#]*)?(#[^"]*)?"([^>]*)>/gi;
const IMG_SRC_RE = /<img\s+([^>]*?)src="([^"]+)"([^>]*)>/gi;

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

export function tagInternalLinks(html: string, currentRelPath: string): string {
  const currentDir = path.dirname(currentRelPath);
  return html.replace(HREF_RE, (full, pre, rawTarget, rawQuery, rawHash, post) => {
    if (!rawTarget || /^https?:\/\//i.test(rawTarget) || rawTarget.startsWith('mailto:')) {
      return full;
    }
    if (!MD_EXT_RE.test(rawTarget)) return full;

    // The captured attribute is already HTML-escaped. Unescape it to get the
    // URL, and escape everything on the way back out: decodeURIComponent turns
    // `%22` into a raw quote that would otherwise close the attribute.
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
    return `<a ${pre}href="${escapeAttr(href)}" data-internal-link="${escapeAttr(internal)}"${post}>`;
  });
}

export function rewriteImageSrc(html: string, currentRelPath: string): string {
  const currentDir = path.dirname(currentRelPath);
  return html.replace(IMG_SRC_RE, (full, pre, src, post) => {
    if (!src) return full;
    if (/^(https?:\/\/|data:|\/__asset\/)/i.test(src)) return full;
    const trimmed = src.replace(/^\/+/, '');
    const resolved = path.normalize(path.join(currentDir, trimmed));
    if (resolved.startsWith('..')) return full;
    return `<img ${pre}src="/__asset/${resolved}"${post}>`;
  });
}
