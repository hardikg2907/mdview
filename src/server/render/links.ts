import path from 'node:path/posix';

const MD_EXT_RE = /\.(md|markdown|mdx)$/i;
const HREF_RE = /<a\s+([^>]*?)href="([^"#?]*)(\?[^"#]*)?(#[^"]*)?"([^>]*)>/gi;

export function tagInternalLinks(html: string, currentRelPath: string): string {
  const currentDir = path.dirname(currentRelPath);
  return html.replace(HREF_RE, (full, pre, target, query, hash, post) => {
    if (!target || /^https?:\/\//i.test(target) || target.startsWith('mailto:')) {
      return full;
    }
    if (!MD_EXT_RE.test(target)) return full;

    const resolved = path.normalize(path.join(currentDir, target));
    const internal = `${resolved}${query ?? ''}${hash ?? ''}`;
    return `<a ${pre}href="${internal}" data-internal-link="${internal}"${post}>`;
  });
}
