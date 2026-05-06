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
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'external-icon');
      icon.setAttribute('viewBox', '0 0 12 12');
      icon.setAttribute('width', '11');
      icon.setAttribute('height', '11');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML =
        '<path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M4.5 2.5h5v5M9.5 2.5L4 8M2.5 5.2v4.3h4.3"/>';
      a.appendChild(icon);
    }
    a.dataset.externalProcessed = '1';
  });
}
