const MD_PATHNAME_RE = /\.(md|markdown|mdx)$/i;

function isModifiedClick(ev: MouseEvent): boolean {
  return ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0;
}

function shouldSkipAnchor(anchor: HTMLAnchorElement): boolean {
  if (anchor.target && anchor.target !== '' && anchor.target !== '_self') return true;
  if (anchor.hasAttribute('download')) return true;
  return false;
}

export function wireInternalLinks(
  root: HTMLElement,
  onNavigate: (relPath: string, hash: string) => void,
): void {
  root.addEventListener('click', (ev) => {
    const anchor = (ev.target as HTMLElement).closest('a');
    if (!anchor) return;

    // Existing path: server-side tagging picked it up.
    const tagged = anchor.matches('[data-internal-link]')
      ? anchor.getAttribute('data-internal-link')
      : null;

    if (tagged !== null) {
      if (isModifiedClick(ev as MouseEvent)) return;

      ev.preventDefault();
      const internal = tagged ?? '';
      const hashIndex = internal.indexOf('#');
      const relPath = hashIndex >= 0 ? internal.slice(0, hashIndex) : internal;
      const hash = hashIndex >= 0 ? internal.slice(hashIndex) : '';
      onNavigate(relPath, hash);
      return;
    }

    // Fallback: tagging missed this link, but it's clearly an internal markdown
    // link (same-origin, ends in .md/.markdown/.mdx). Without this we'd let the
    // browser do a real navigation to /foo.md and the SPA fallback would load a
    // random file.
    if (isModifiedClick(ev as MouseEvent)) return;
    if (shouldSkipAnchor(anchor as HTMLAnchorElement)) return;

    const href = (anchor as HTMLAnchorElement).href;
    if (!href) return;

    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return;
    }

    // Same-origin guard — never redirect off-origin URLs through the file loader.
    if (url.origin !== window.location.origin) return;
    if (!MD_PATHNAME_RE.test(url.pathname)) return;

    ev.preventDefault();

    // The browser already resolved any relative path against the current URL
    // and gave us an absolute pathname; decode percent-encoding so the file
    // loader sees the literal relPath.
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(url.pathname);
    } catch {
      decodedPath = url.pathname;
    }
    const relPath = decodedPath.replace(/^\/+/, '');
    onNavigate(relPath, url.hash);
  });
}
