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

export function Minimap({ outline }: Props) {
  const scroller = mainScrollerSignal.value;
  const [bars, setBars] = useState<Bar[]>([]);
  const [scrollFrac, setScrollFrac] = useState({ top: 0, height: 0 });
  const railRef = useRef<HTMLDivElement | null>(null);

  // Recompute bars when outline or scroller changes (not on every scroll).
  useEffect(() => {
    if (!scroller) return;
    const update = () => setBars(computeBars(scroller, outline));
    update();
    // ResizeObserver fires when content height changes (mermaid loads, etc.)
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller, outline]);

  // Track the visible viewport rectangle within the scroller.
  useEffect(() => {
    if (!scroller) return;
    const onScroll = () => {
      const total = scroller.scrollHeight || 1;
      setScrollFrac({
        top: scroller.scrollTop / total,
        height: scroller.clientHeight / total,
      });
    };
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [scroller]);

  function jumpFromY(clientY: number) {
    const rail = railRef.current;
    if (!rail || !scroller) return;
    const rect = rail.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    scroller.scrollTo({ top: frac * scroller.scrollHeight, behavior: 'smooth' });
  }

  if (!scroller || bars.length === 0) return null;

  const active = activeHeadingId.value;

  return (
    <div
      ref={railRef}
      class="minimap"
      role="navigation"
      aria-label="Document minimap"
      onClick={(ev) => jumpFromY(ev.clientY)}
    >
      {bars.map((b) => (
        <div
          key={b.id}
          class={`minimap-bar minimap-level-${b.level}${active === b.id ? ' is-active' : ''}`}
          style={{ top: `${(b.ratio * 100).toFixed(2)}%` }}
          title={b.id}
        />
      ))}
      <div
        class="minimap-viewport"
        style={{
          top: `${(scrollFrac.top * 100).toFixed(2)}%`,
          height: `${(scrollFrac.height * 100).toFixed(2)}%`,
        }}
      />
    </div>
  );
}
