import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

export interface HeadingPos { id: string; top: number; }

export const activeHeadingId = signal<string | null>(null);
export const breadcrumbPath = signal<string[]>([]);

export function pickActiveId(positions: HeadingPos[], scrollTop: number): string | null {
  if (positions.length === 0) return null;
  const offset = 80;
  let active = positions[0]!.id;
  for (const p of positions) {
    if (p.top - offset <= scrollTop) active = p.id;
    else break;
  }
  return active;
}

export function useScrollSpy(scrollContainer: HTMLElement | null): void {
  useEffect(() => {
    if (!scrollContainer) return;
    let raf = 0;

    function compute() {
      const headings = Array.from(
        scrollContainer!.querySelectorAll<HTMLHeadingElement>('.markdown-content :is(h1,h2,h3,h4,h5,h6)[id]'),
      );
      const positions: HeadingPos[] = headings.map((h) => ({
        id: h.id,
        top: h.offsetTop,
      }));
      activeHeadingId.value = pickActiveId(positions, scrollContainer!.scrollTop);
    }

    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    }

    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    compute();
    return () => {
      cancelAnimationFrame(raf);
      scrollContainer.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainer]);
}
