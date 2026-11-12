import { useEffect, useRef } from 'preact/hooks';

interface Props {
  scroller: HTMLElement | null;
  trigger: unknown;
}

export function ReadingProgress({ scroller, trigger: _trigger }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const lastRoundedRef = useRef(-1);

  useEffect(() => {
    if (!scroller) return;
    let raf = 0;

    function compute() {
      if (!scroller) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      const p = max <= 0 ? 0 : Math.max(0, Math.min(1, scroller.scrollTop / max));
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${p})`;
      }
      const rounded = Math.round(p * 100);
      if (rounded !== lastRoundedRef.current) {
        lastRoundedRef.current = rounded;
        wrapRef.current?.setAttribute('aria-valuenow', String(rounded));
      }
    }

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    }

    scroller.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    compute();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scroller.removeEventListener('scroll', schedule);
    };
  }, [scroller, _trigger]);

  return (
    <div
      ref={wrapRef}
      class="reading-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      aria-label="Reading progress"
    >
      <div ref={barRef} class="reading-progress__bar" />
    </div>
  );
}
