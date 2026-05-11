import path from 'node:path/posix';

const MD_EXT_RE = /\.(md|markdown|mdx)$/i;
const HREF_RE = /<a\s+([^>]*?)href="([^"#?]*)(\?[^"#]*)?(#[^"]*)?"([^>]*)>/gi;
const IMG_SRC_RE = /<img\s+([^>]*?)src="([^"]+)"([^>]*)>/gi;

export function tagInternalLinks(html: string, currentRelPath: string): string {
  const currentDir = path.dirname(currentRelPath);
  return html.replace(HREF_RE, (full, pre, target, query, hash, post) => {
    if (!target || /^https?:\/\//i.test(target) || target.startsWith('mailto:')) {
      return full;
    }
    if (!MD_EXT_RE.test(target)) return full;

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
    return `<a ${pre}href="${href}" data-internal-link="${internal}"${post}>`;
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
