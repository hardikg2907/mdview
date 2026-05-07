import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

export interface HeadingPos { id: string; top: number; }

export const activeHeadingId = signal<string | null>(null);
export const breadcrumbPath = signal<string[]>([]);

let scrollSpyLockedUntil = 0;
export function lockScrollSpy(id: string, ms = 600): void {
  activeHeadingId.value = id;
  scrollSpyLockedUntil = performance.now() + ms;
}

export function pickActiveId(positions: HeadingPos[], scrollTop: number): string | null {
  if (positions.length === 0) return null;
  // Matches `scroll-margin-top` on headings in content.css. Plus a small
  // tolerance for sub-pixel rounding from smooth-scroll easing landings.
  const offset = 16;
  const tolerance = 6;
  let active = positions[0]!.id;
  for (const p of positions) {
    if (p.top - offset <= scrollTop + tolerance) active = p.id;
    else break;
  }
  return active;
}

export function useScrollSpy(scrollContainer: HTMLElement | null): void {
  useEffect(() => {
    if (!scrollContainer) return;
    let raf = 0;
    let cachedHeadings: HTMLHeadingElement[] = [];
    let cachedPositions: HeadingPos[] = [];

    function refreshCache(): void {
      const scrollerRect = scrollContainer!.getBoundingClientRect();
      const scrollTop = scrollContainer!.scrollTop;
      cachedHeadings = Array.from(
        scrollContainer!.querySelectorAll<HTMLHeadingElement>(
          '.markdown-content :is(h1,h2,h3,h4,h5,h6)[id]',
        ),
      );
      cachedPositions = cachedHeadings.map((h) => {
        const r = h.getBoundingClientRect();
        return { id: h.id, top: r.top - scrollerRect.top + scrollTop };
      });
    }

    function compute(): void {
      if (performance.now() < scrollSpyLockedUntil) return;
      const next = pickActiveId(cachedPositions, scrollContainer!.scrollTop);
      if (next !== activeHeadingId.value) activeHeadingId.value = next;
    }

    function onScroll(): void {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    }

    // Initial cache + compute after layout settles.
    refreshCache();
    compute();

    // Re-cache when the rendered content changes (file swap, mermaid/math
    // load, image dimensions resolved, etc.).
    const ro = new ResizeObserver(() => {
      refreshCache();
      compute();
    });
    ro.observe(scrollContainer);
    const mo = new MutationObserver(() => {
      refreshCache();
      compute();
    });
    const content = scrollContainer.querySelector('.markdown-content');
    if (content) mo.observe(content, { childList: true, subtree: true });

    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      scrollContainer.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainer]);
}
