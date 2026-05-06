import { useEffect, useState } from 'preact/hooks';

interface Props {
  scroller: HTMLElement | null;
  trigger: unknown;
}

export function ReadingProgress({ scroller, trigger: _trigger }: Props) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!scroller) return;
    let raf = 0;

    function compute() {
      if (!scroller) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max <= 0) {
        setPercent(0);
        return;
      }
      const p = Math.max(0, Math.min(1, scroller.scrollTop / max));
      setPercent(p);
    }

    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    }

    scroller.addEventListener('scroll', onScroll, { passive: true });
    compute();
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [scroller, _trigger]);

  return (
    <div
      class="reading-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent * 100)}
      aria-label="Reading progress"
    >
      <div class="reading-progress__bar" style={{ width: `${percent * 100}%` }} />
    </div>
  );
}
