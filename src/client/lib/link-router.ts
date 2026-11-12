const MD_PATHNAME_RE = /\.(md|markdown|mdx)$/i;

type NavigateHandler = (relPath: string, hash: string) => void;
const wiredRoots = new WeakMap<HTMLElement, NavigateHandler>();

function isModifiedClick(ev: MouseEvent): boolean {
  return ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0;
}

function shouldSkipAnchor(anchor: Element): boolean {
  const target = anchor.getAttribute('target');
  if (target && target !== '' && target.toLowerCase() !== '_self') return true;
  if (anchor.hasAttribute('download')) return true;
  return false;
}

export function wireInternalLinks(root: HTMLElement, onNavigate: NavigateHandler): void {
  const alreadyWired = wiredRoots.has(root);
  wiredRoots.set(root, onNavigate);
  if (alreadyWired) return;

  root.addEventListener('click', (ev) => {
    const navigate = wiredRoots.get(root);
    if (!navigate) return;

    const anchor = ev.target instanceof Element ? ev.target.closest('a') : null;
    if (!anchor) return;

    // Existing path: server-side tagging picked it up.
    const tagged = anchor.matches('[data-internal-link]')
      ? anchor.getAttribute('data-internal-link')
      : null;

    if (tagged !== null) {
      if (isModifiedClick(ev)) return;

      ev.preventDefault();
      const internal = tagged ?? '';
      const hashIndex = internal.indexOf('#');
      const relPath = hashIndex >= 0 ? internal.slice(0, hashIndex) : internal;
      const hash = hashIndex >= 0 ? internal.slice(hashIndex) : '';
      navigate(relPath, hash);
      return;
    }

    // Fallback: tagging missed this link, but it's clearly an internal markdown
    // link (same-origin, ends in .md/.markdown/.mdx). Without this we'd let the
    // browser do a real navigation to /foo.md and the SPA fallback would load a
    // random file.
    if (isModifiedClick(ev)) return;
    if (shouldSkipAnchor(anchor)) return;

    const rawHref = anchor.getAttribute('href');
    if (!rawHref) return;

    let url: URL;
    try {
      url = new URL(rawHref, window.location.href);
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
    navigate(relPath, url.hash);
  });
}
