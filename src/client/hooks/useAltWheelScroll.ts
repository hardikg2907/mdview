import { useEffect } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * Default multiplier applied to the wheel delta when Option/Alt is held.
 * Picked to feel close to JetBrains/VSCode "faster scroll" behavior.
 */
const DEFAULT_MULTIPLIER = 4;

export interface UseAltWheelScrollOptions {
  /** Scroll-speed multiplier when Option/Alt is held. Defaults to 4. */
  multiplier?: number;
}

/**
 * IDE-style fast scroll: while the user holds Option (Mac) / Alt (Win/Linux)
 * and turns the wheel/trackpad over the referenced element, wheel deltas are
 * multiplied (default 4x) before being applied via `scrollBy`. Normal wheel
 * scrolling (no modifier) is left completely untouched.
 *
 * The listener is registered with `{ passive: false }` because it must call
 * `preventDefault()` to suppress the browser's native (1x) scroll before
 * applying the boosted delta.
 */
export function useAltWheelScroll(
  ref: RefObject<HTMLElement | null> | { current: HTMLElement | null },
  opts?: UseAltWheelScrollOptions,
): void {
  const multiplier = opts?.multiplier ?? DEFAULT_MULTIPLIER;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onWheel(e: WheelEvent): void {
      if (!e.altKey) return; // let normal scroll proceed
      e.preventDefault();
      el!.scrollBy({
        top: e.deltaY * multiplier,
        left: e.deltaX * multiplier,
        behavior: 'auto',
      });
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
    // Re-run when the ref object identity or multiplier changes.
    // `ref.current` is intentionally not in deps (it's a ref); the effect
    // re-attaches when callers swap the ref object itself.
  }, [ref, multiplier]);
}
