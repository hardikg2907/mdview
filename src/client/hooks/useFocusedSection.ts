import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

/**
 * Heading whose section currently contains the vertical center of the
 * viewport. Used by focus mode (separate from `activeHeadingId`, which tracks
 * the topmost-passed heading and drives the outline highlight).
 */
export const focusedSectionId = signal<string | null>(null);

/**
 * Pick the active focused-section index given heading positions and current
 * scroll state. Pure (no DOM) so it's testable in isolation.
 *
 * Uses a proportional focus line: at scrollTop=0 the line sits at the top of
 * the viewport (so the first heading wins), at max scroll it sits at the
 * bottom (so the last heading wins), and in between it interpolates. A fixed
 * viewport-center never reaches 0 or scrollHeight, which made the first/last
 * sections — especially short ones — impossible to focus.
 */
export function pickFocusedIndex(
  tops: number[],
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): number {
  if (tops.length === 0) return -1;
  const maxScroll = scrollHeight - clientHeight;
  const focusY =
    maxScroll > 0
      ? scrollTop + clientHeight * (scrollTop / maxScroll)
      : scrollTop + clientHeight / 2;
  let activeIdx = -1;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i]! <= focusY) activeIdx = i;
    else break;
  }
  if (activeIdx < 0) activeIdx = 0;
  return activeIdx;
}

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
      const idx = pickFocusedIndex(
        cachedTops,
        scroller.scrollTop,
        scroller.clientHeight,
        scroller.scrollHeight,
      );
      const next = idx >= 0 ? cachedHeadings[idx]!.id : null;
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
