import { describe, it, expect } from 'vitest';
import { pickActiveId } from '../../src/client/hooks/useScrollSpy.js';

describe('pickActiveId', () => {
  const positions = [
    { id: 'a', top: 0 },
    { id: 'b', top: 200 },
    { id: 'c', top: 500 },
  ];

  // A doc taller than the viewport so middle-scroll branches actually
  // exercise the topmost-passed pick (not the boundary snaps).
  const CH = 400; // clientHeight
  const SH = 2000; // scrollHeight

  it('returns first heading when before all (negative scrollTop)', () => {
    expect(pickActiveId(positions, -50, CH, SH)).toBe('a');
  });

  it('returns the most recently passed heading mid-scroll', () => {
    expect(pickActiveId(positions, 250, CH, SH)).toBe('b');
    expect(pickActiveId(positions, 600, CH, SH)).toBe('c');
  });

  it('returns null for empty list', () => {
    expect(pickActiveId([], 0, CH, SH)).toBeNull();
  });

  it('snaps to the last position when scrolled to the bottom even if its top is below scrollTop', () => {
    // Doc 1000, viewport 400, max scroll = 600. Last heading at 950 — never
    // reaches viewport top, so the "topmost-passed" rule alone would leave
    // it stuck on the second-to-last. Boundary snap fixes that.
    const shortDoc = [
      { id: 'a', top: 0 },
      { id: 'b', top: 500 },
      { id: 'c', top: 950 },
    ];
    expect(pickActiveId(shortDoc, 600, 400, 1000)).toBe('c');
  });

  it('uses a 1px epsilon for the bottom snap (handles sub-pixel scroll)', () => {
    const shortDoc = [
      { id: 'a', top: 0 },
      { id: 'b', top: 500 },
      { id: 'c', top: 950 },
    ];
    // scrollTop 599.5 + clientHeight 400 = 999.5 ≥ 1000 - 1 → snap.
    expect(pickActiveId(shortDoc, 599.5, 400, 1000)).toBe('c');
  });

  it('snaps to the first position when scrollTop <= 0', () => {
    // Even if a later heading sits at top=0 (e.g. odd layout), scrollTop 0
    // should always pick the first id.
    expect(pickActiveId(positions, 0, CH, SH)).toBe('a');
  });
});
