export function markExternalLinks(root: HTMLElement): void {
  const anchors = root.querySelectorAll<HTMLAnchorElement>('a[href]');
  anchors.forEach((a) => {
    if (a.dataset.externalProcessed === '1') return;
    if (a.hasAttribute('data-internal-link')) return;
    const href = a.getAttribute('href') ?? '';
    if (!/^https?:\/\//i.test(href)) return;
    if (a.classList.contains('heading-anchor')) return;

    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.classList.add('is-external');
    if (!a.querySelector('.external-icon')) {
      const icon = document.createElement('span');
      icon.className = 'external-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '↗';
      a.appendChild(icon);
    }
    a.dataset.externalProcessed = '1';
  });
}
