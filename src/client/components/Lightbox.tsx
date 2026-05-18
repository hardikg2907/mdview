import { useEffect } from 'preact/hooks';
import { closeLightbox, lightboxSignal } from '../hooks/useLightbox.js';

export function Lightbox() {
  const state = lightboxSignal.value;

  useEffect(() => {
    if (!state) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') closeLightbox();
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [state]);

  if (!state) return null;

  return (
    <div
      class="lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={state.alt || 'Image preview'}
      onClick={closeLightbox}
    >
      <button
        type="button"
        class="lightbox-close"
        aria-label="Close image preview"
        onClick={(ev) => {
          ev.stopPropagation();
          closeLightbox();
        }}
      >
        ×
      </button>
      <img
        class="lightbox-img"
        src={state.src}
        alt={state.alt}
        onClick={(ev) => ev.stopPropagation()}
      />
    </div>
  );
}
