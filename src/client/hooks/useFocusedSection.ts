import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

/**
 * Heading whose section currently contains the vertical center of the
 * viewport. Used by focus mode (separate from `activeHeadingId`, which tracks
 * the topmost-passed heading and drives the outline highlight).
 */
export const focusedSectionId = signal<string | null>(null);

export function useFocusedSection(scrollContainer: HTMLElement | null): void {
  useEffect(() => {
    if (!scrollContainer) return;
    let raf = 0;
    let cachedHeadings: HTMLHeadingElement[] = [];
    let cachedTops: number[] = [];

    function refreshCache(): void {
      const scrollerRect = scrollContainer!.getBoundingClientRect();
      const scrollTop = scrollContainer!.scrollTop;
      cachedHeadings = Array.from(
        scrollContainer!.querySelectorAll<HTMLHeadingElement>(
          '.markdown-content :is(h1,h2,h3,h4,h5,h6)[id]',
        ),
      );
      cachedTops = cachedHeadings.map((h) => {
        const r = h.getBoundingClientRect();
        return r.top - scrollerRect.top + scrollTop;
      });
    }

    function compute(): void {
      const scroller = scrollContainer!;
      // The vertical center of the viewport, in scroller content coordinates.
      const centerY = scroller.scrollTop + scroller.clientHeight / 2;
      let activeIdx = -1;
      for (let i = 0; i < cachedTops.length; i++) {
        if (cachedTops[i]! <= centerY) activeIdx = i;
        else break;
      }
      // If the center is above the first heading, fall back to the first.
      if (activeIdx < 0 && cachedHeadings.length > 0) activeIdx = 0;
      const next = activeIdx >= 0 ? cachedHeadings[activeIdx]!.id : null;
      if (next !== focusedSectionId.value) focusedSectionId.value = next;
    }

    function onScroll(): void {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    }

    refreshCache();
    compute();

    const ro = new ResizeObserver(() => { refreshCache(); compute(); });
    ro.observe(scrollContainer);
    // Observe the scroller itself with subtree:true so we still react when
    // `.markdown-content` is added later (it's gated on file-loaded in App)
    // and when its innerHTML is swapped on each file change.
    const mo = new MutationObserver(() => { refreshCache(); compute(); });
    mo.observe(scrollContainer, { childList: true, subtree: true });

    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      scrollContainer.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainer]);
}
