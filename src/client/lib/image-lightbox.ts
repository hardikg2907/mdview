import { openLightbox } from '../hooks/useLightbox.js';

export function wireImageLightbox(root: HTMLElement): void {
  const imgs = root.querySelectorAll<HTMLImageElement>('.markdown-content img');
  imgs.forEach((img) => {
    if (img.dataset.lightboxWired === '1') return;
    if (img.closest('.mermaid-block')) return;

    img.dataset.lightboxWired = '1';
    img.classList.add('img-zoomable');
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', `Open ${img.alt || 'image'} fullscreen`);

    img.addEventListener('click', () => {
      openLightbox(img.src, img.alt);
    });
    img.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openLightbox(img.src, img.alt);
      }
    });
  });
}
