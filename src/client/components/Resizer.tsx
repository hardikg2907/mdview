import { useEffect, useRef } from 'preact/hooks';

interface Props {
  side: 'left' | 'right';
  ariaLabel: string;
  /** Read latest current width (live, not closed-over). */
  getCurrent: () => number;
  /** Persist a new width during drag. */
  onResize: (px: number) => void;
  /** If drag ends below this width, collapse instead. */
  collapseAt: number;
  onCollapse: () => void;
  min: number;
  max: number;
}

/**
 * Pointer-driven drag handle between two panes. `side: 'left'` is the right
 * edge of the left sidebar (drag right = wider); `side: 'right'` is the left
 * edge of the right sidebar (drag right = narrower).
 */
export function Resizer(props: Props) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  // Stash the latest props in a ref so the pointer handlers — set up once —
  // always read the current callbacks. Avoids tearing the listener down each
  // render when callers pass fresh inline arrows.
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    let drag: { startX: number; startWidth: number; pointerId: number } | null = null;

    function onMove(ev: PointerEvent) {
      if (!drag) return;
      const { side, onResize, min, max } = latest.current;
      const delta = ev.clientX - drag.startX;
      const next = side === 'left' ? drag.startWidth + delta : drag.startWidth - delta;
      onResize(Math.min(max, Math.max(min, next)));
    }
    function onUp() {
      if (!drag) return;
      const { collapseAt, onCollapse, getCurrent } = latest.current;
      const final = getCurrent();
      const node = nodeRef.current;
      try { node?.releasePointerCapture(drag.pointerId); } catch { /* released */ }
      drag = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (final < collapseAt) onCollapse();
    }
    function onDown(ev: PointerEvent) {
      drag = {
        startX: ev.clientX,
        startWidth: latest.current.getCurrent(),
        pointerId: ev.pointerId,
      };
      try { node!.setPointerCapture(ev.pointerId); } catch { /* unsupported */ }
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      ev.preventDefault();
    }

    node.addEventListener('pointerdown', onDown);
    return () => {
      node.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (drag) {
        try { node.releasePointerCapture(drag.pointerId); } catch { /* released */ }
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, []);

  return (
    <div
      ref={nodeRef}
      class={`resizer resizer-${props.side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={props.ariaLabel}
    />
  );
}
