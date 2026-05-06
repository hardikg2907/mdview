export function wirePermalinks(root: HTMLElement): void {
  const headings = root.querySelectorAll<HTMLHeadingElement>(
    '.markdown-content :is(h1,h2,h3,h4,h5,h6)[id]',
  );
  headings.forEach((h) => {
    if (h.querySelector('.heading-anchor')) return;

    const a = document.createElement('a');
    a.className = 'heading-anchor';
    a.href = `#${h.id}`;
    a.setAttribute('aria-label', `Copy link to ${h.textContent ?? ''}`);
    a.title = 'Copy link to this section';
    a.textContent = '#';

    a.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const sp = new URLSearchParams(window.location.search);
      const file = sp.get('file');
      const url = `${window.location.origin}${window.location.pathname}${
        file ? `?file=${encodeURIComponent(file)}` : ''
      }#${h.id}`;
      try {
        await navigator.clipboard.writeText(url);
        a.textContent = '✓';
        a.classList.add('is-copied');
      } catch {
        a.textContent = '!';
      }
      window.setTimeout(() => {
        a.textContent = '#';
        a.classList.remove('is-copied');
      }, 1500);
    });

    h.appendChild(a);
  });
}
