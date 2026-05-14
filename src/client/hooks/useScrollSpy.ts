import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

export interface HeadingPos { id: string; top: number; }

export const activeHeadingId = signal<string | null>(null);
export const breadcrumbPath = signal<string[]>([]);

/**
 * Heading anchor used for focus-mode dimming. Distinct from `activeHeadingId`:
 *   - `activeHeadingId` answers "where am I in the doc?" — anchored at the
 *     viewport top, drives breadcrumbs/outline/minimap (a navigation signal).
 *   - `focusedHeadingId` answers "what am I reading right now?" — anchored at
 *     the top-third reading band, drives the focus-mode highlight so the
 *     section under your eyes stays bright and the next section dims until
 *     it actually enters your reading zone.
 *
 * They only disagree at section boundaries, which is exactly where the
 * single-anchor approach felt wrong (focus highlight pointed off-screen up).
 */
export const focusedHeadingId = signal<string | null>(null);

let scrollSpyLockedUntil = 0;
export function lockScrollSpy(id: string, ms = 600): void {
  activeHeadingId.value = id;
  focusedHeadingId.value = id;
  scrollSpyLockedUntil = performance.now() + ms;
}

export function pickActiveId(
  positions: HeadingPos[],
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): string | null {
  if (positions.length === 0) return null;
  // Boundary snaps: short first/last sections may never reach the active
  // selection band under the "topmost-passed heading" rule, since their
  // heading top can't be scrolled past the viewport offset. Snap to the
  // first/last position explicitly when the scroller is at either edge so
  // the outline (and focus-mode dim) stay in sync with the visible content.
  if (scrollTop <= 0) return positions[0]!.id;
  // 1px epsilon guards against sub-pixel scrollTop at the bottom.
  if (scrollTop + clientHeight >= scrollHeight - 1) {
    return positions[positions.length - 1]!.id;
  }
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

/**
 * "What am I reading right now?" — picks the most recent heading whose top
 * has crossed the **top-third reading band** (~35% from the viewport top).
 *
 * Anchored at 35% (not 0%) because eyetracking shows readers concentrate in
 * the upper third of the viewport, not at the very edge. This makes the
 * focus highlight roll forward to the next section the moment its title
 * enters the reading zone, so the bright section is always the one under
 * your eyes — never the heading that scrolled off-screen pages ago.
 */
export const FOCUS_BAND_FRACTION = 0.35;

export function pickFocusedId(
  positions: HeadingPos[],
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): string | null {
  if (positions.length === 0) return null;
  // Same boundary snaps as the active picker: at scroll top/bottom, snap to
  // first/last so the highlight matches what's visible even if a short
  // section never crosses the band.
  if (scrollTop <= 0) return positions[0]!.id;
  if (scrollTop + clientHeight >= scrollHeight - 1) {
    return positions[positions.length - 1]!.id;
  }
  const bandY = scrollTop + clientHeight * FOCUS_BAND_FRACTION;
  let focused = positions[0]!.id;
  for (const p of positions) {
    if (p.top <= bandY) focused = p.id;
    else break;
  }
  return focused;
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
      const scroller = scrollContainer!;
      const st = scroller.scrollTop;
      const ch = scroller.clientHeight;
      const sh = scroller.scrollHeight;
      const nextActive = pickActiveId(cachedPositions, st, ch, sh);
      if (nextActive !== activeHeadingId.value) activeHeadingId.value = nextActive;
      const nextFocused = pickFocusedId(cachedPositions, st, ch, sh);
      if (nextFocused !== focusedHeadingId.value) focusedHeadingId.value = nextFocused;
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
    // Observe the scroller (subtree) — catches `.markdown-content` being
    // added on first file-load AND its innerHTML being swapped on each
    // file change. Observing `.markdown-content` directly misses the first
    // case because it doesn't exist yet at hook-mount time.
    // `hidden` attribute changes get observed too: collapsible-sections toggles
    // `hidden` on trailing siblings of folded headings, which collapses their
    // layout boxes without changing childList. Without this, the cached
    // heading offsets stay stale after a fold and the outline / breadcrumb
    // pick the wrong active heading.
    mo.observe(scrollContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });

    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      scrollContainer.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainer]);
}
