import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

export interface HeadingPos { id: string; top: number; }

export const activeHeadingId = signal<string | null>(null);

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

function pickLastAtOrAbove(positions: HeadingPos[], threshold: number): string {
  let lo = 0;
  let hi = positions.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (positions[mid]!.top <= threshold) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return positions[ans]!.id;
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
  return pickLastAtOrAbove(positions, scrollTop + tolerance + offset);
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
  return pickLastAtOrAbove(positions, bandY);
}

export function useScrollSpy(scrollContainer: HTMLElement | null): void {
  useEffect(() => {
    if (!scrollContainer) return;
    let scrollRaf = 0;
    let refreshRaf = 0;
    let cachedPositions: HeadingPos[] = [];

    function refreshCache(): void {
      const scrollerRect = scrollContainer!.getBoundingClientRect();
      const scrollTop = scrollContainer!.scrollTop;
      const headings = scrollContainer!.querySelectorAll<HTMLHeadingElement>(
        '.markdown-content :is(h1,h2,h3,h4,h5,h6)[id]',
      );
      const next: HeadingPos[] = new Array(headings.length);
      for (let i = 0; i < headings.length; i++) {
        const h = headings[i]!;
        const r = h.getBoundingClientRect();
        next[i] = { id: h.id, top: r.top - scrollerRect.top + scrollTop };
      }
      cachedPositions = next;
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
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        compute();
      });
    }

    function scheduleRefresh(): void {
      if (refreshRaf) return;
      refreshRaf = requestAnimationFrame(() => {
        refreshRaf = 0;
        refreshCache();
        compute();
      });
    }

    // Initial cache + compute after layout settles.
    refreshCache();
    compute();

    // Coalesce bursts of DOM/layout changes (wire pipeline mutations, mermaid
    // & math renders, image loads, collapsible folds) into at most one forced
    // layout measurement per animation frame.
    const ro = new ResizeObserver(scheduleRefresh);
    ro.observe(scrollContainer);
    const mo = new MutationObserver(scheduleRefresh);
    mo.observe(scrollContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });

    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(scrollRaf);
      cancelAnimationFrame(refreshRaf);
      ro.disconnect();
      mo.disconnect();
      scrollContainer.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainer]);
}
