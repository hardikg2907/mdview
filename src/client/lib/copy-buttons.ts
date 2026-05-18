export function wireCopyButtons(root: HTMLElement): void {
  const pres = root.querySelectorAll<HTMLPreElement>('pre');
  pres.forEach((pre) => {
    if (pre.closest('.mermaid-block')) return;
    if (pre.parentElement?.classList.contains('pre-wrap')) return;

    const wrap = document.createElement('div');
    wrap.className = 'pre-wrap';
    pre.replaceWith(wrap);
    wrap.appendChild(pre);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');

    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const code = pre.querySelector('code');
      const text = (code?.textContent ?? pre.textContent ?? '').replace(/\s+$/, '');
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
        btn.classList.add('is-copied');
      } catch {
        btn.textContent = 'Failed';
      }
      window.setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('is-copied');
      }, 1600);
    });

    wrap.appendChild(btn);
  });
}
