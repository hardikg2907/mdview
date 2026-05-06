export function wireInternalLinks(
  root: HTMLElement,
  onNavigate: (relPath: string, hash: string) => void,
): void {
  root.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest('a[data-internal-link]');
    if (!target) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;

    ev.preventDefault();
    const internal = target.getAttribute('data-internal-link') ?? '';
    const hashIndex = internal.indexOf('#');
    const relPath = hashIndex >= 0 ? internal.slice(0, hashIndex) : internal;
    const hash = hashIndex >= 0 ? internal.slice(hashIndex) : '';
    onNavigate(relPath, hash);
  });
}
