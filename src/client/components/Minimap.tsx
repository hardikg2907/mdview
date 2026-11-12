import { useComputed } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { OutlineNode } from '../../shared/types.js';
import { mainScrollerSignal } from '../hooks/useScroller.js';
import { activeHeadingId } from '../hooks/useScrollSpy.js';
import { flattenHeadings } from '../lib/outline-nav.js';

interface Props {
  outline: OutlineNode[];
}

interface Bar {
  id: string;
  level: number;
  /** Vertical fraction (0..1) of the heading element within the scroller. */
  ratio: number;
}

function computeBars(scroller: HTMLElement, outline: OutlineNode[]): Bar[] {
  if (!scroller) return [];
  const flat = flattenHeadings(outline);
  const total = scroller.scrollHeight;
  if (total === 0) return [];
  const bars: Bar[] = [];
  const scrollerRect = scroller.getBoundingClientRect();
  for (const { id, level } of flat) {
    const el = scroller.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const top = r.top - scrollerRect.top + scroller.scrollTop;
    const ratio = top / total;
    bars.push({ id, level, ratio: Math.max(0, Math.min(1, ratio)) });
  }
  return bars;
}

function MinimapBar({ bar }: { bar: Bar }) {
  const isActive = useComputed(() => activeHeadingId.value === bar.id).value;
  return (
    <div
      class={`minimap-bar minimap-level-${bar.level}${isActive ? ' is-active' : ''}`}
      style={{ top: `${(bar.ratio * 100).toFixed(2)}%` }}
      title={bar.id}
    />
  );
}

export function Minimap({ outline }: Props) {
  const scroller = mainScrollerSignal.value;
  const [bars, setBars] = useState<Bar[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Recompute bars when outline or scroller changes (coalesced via rAF).
  useEffect(() => {
    if (!scroller) return;
    let raf = 0;
    const update = () => setBars(computeBars(scroller, outline));
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    update();
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scroller, outline]);

  // Track the visible viewport rectangle directly on the DOM node inside rAF
  // so scrolling never re-renders the bar list.
  useEffect(() => {
    if (!scroller) return;
    let raf = 0;
    const syncViewport = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      const total = scroller.scrollHeight || 1;
      vp.style.top = `${((scroller.scrollTop / total) * 100).toFixed(2)}%`;
      vp.style.height = `${((scroller.clientHeight / total) * 100).toFixed(2)}%`;
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        syncViewport();
      });
    };
    syncViewport();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [scroller, bars.length]);

  function jumpFromY(clientY: number) {
    const rail = railRef.current;
    if (!rail || !scroller) return;
    const rect = rail.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    scroller.scrollTo({ top: frac * scroller.scrollHeight, behavior: 'smooth' });
  }

  if (!scroller || bars.length === 0) return null;

  return (
    <div
      ref={railRef}
      class="minimap"
      role="navigation"
      aria-label="Document minimap"
      onClick={(ev) => jumpFromY(ev.clientY)}
    >
      {bars.map((b) => (
        <MinimapBar key={b.id} bar={b} />
      ))}
      <div ref={viewportRef} class="minimap-viewport" />
    </div>
  );
}
