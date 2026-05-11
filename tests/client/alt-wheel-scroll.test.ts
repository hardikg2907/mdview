import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';
import { useRef } from 'preact/hooks';
import { useAltWheelScroll } from '../../src/client/hooks/useAltWheelScroll.js';

/** Flush preact's effect queue (which is scheduled via rAF + setTimeout). */
async function flushEffects(): Promise<void> {
  // Preact schedules effects via requestAnimationFrame, falling back to a
  // setTimeout(35) safety net. Wait long enough for either to fire.
  await new Promise((r) => setTimeout(r, 60));
}

/**
 * Mounts a small component that wires `useAltWheelScroll` to a div and returns
 * the live element + a `scrollBy` spy attached to it.
 */
async function mount(
  multiplier?: number,
): Promise<{ el: HTMLElement; scrollBy: ReturnType<typeof vi.fn>; host: HTMLElement }> {
  let captured: HTMLElement | null = null;
  function Probe(): preact.JSX.Element {
    const ref = useRef<HTMLElement | null>(null);
    useAltWheelScroll(ref, multiplier !== undefined ? { multiplier } : undefined);
    return h('div', {
      ref: (node: HTMLElement | null) => {
        ref.current = node;
        captured = node;
      },
      style: 'height:200px;overflow:auto',
    });
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  render(h(Probe, {}), host);
  if (!captured) throw new Error('probe did not render');
  const el = captured as HTMLElement;
  const scrollBy = vi.fn();
  // happy-dom does not implement scrollBy on HTMLElement; install a spy.
  (el as unknown as { scrollBy: typeof scrollBy }).scrollBy = scrollBy;
  await flushEffects();
  return { el, scrollBy, host };
}

function wheel(opts: { deltaY?: number; deltaX?: number; altKey?: boolean }): WheelEvent {
  // happy-dom's WheelEvent constructor ignores `altKey`, `deltaX`, `deltaY`
  // from the init dict, so we set them explicitly via defineProperty.
  const ev = new WheelEvent('wheel', { cancelable: true, bubbles: true });
  Object.defineProperty(ev, 'altKey', { value: opts.altKey ?? false });
  Object.defineProperty(ev, 'deltaY', { value: opts.deltaY ?? 0 });
  Object.defineProperty(ev, 'deltaX', { value: opts.deltaX ?? 0 });
  return ev;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useAltWheelScroll', () => {
  it('ignores wheel events without Alt and does not preventDefault', async () => {
    const { el, scrollBy } = await mount();
    const ev = wheel({ deltaY: 100, altKey: false });
    el.dispatchEvent(ev);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it('multiplies deltaY by 4 by default when Alt is held and preventsDefault', async () => {
    const { el, scrollBy } = await mount();
    const ev = wheel({ deltaY: 100, altKey: true });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({ top: 400, left: 0, behavior: 'auto' });
  });

  it('honors a custom multiplier and passes deltaX through', async () => {
    const { el, scrollBy } = await mount(2);
    const ev = wheel({ deltaY: 50, deltaX: 10, altKey: true });
    el.dispatchEvent(ev);
    expect(scrollBy).toHaveBeenCalledWith({ top: 100, left: 20, behavior: 'auto' });
  });

  it('cleans up the listener on unmount', async () => {
    const { el, scrollBy, host } = await mount();
    // Sanity: listener is attached before unmount.
    el.dispatchEvent(wheel({ deltaY: 10, altKey: true }));
    expect(scrollBy).toHaveBeenCalledTimes(1);
    scrollBy.mockReset();

    // Unmount by rendering null into the same host, then let cleanup run.
    render(null, host);
    await flushEffects();

    el.dispatchEvent(wheel({ deltaY: 100, altKey: true }));
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
