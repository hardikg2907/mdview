import { describe, it, expect } from 'vitest';
import {
  pickActiveId,
  pickFocusedId,
  FOCUS_BAND_FRACTION,
} from '../../src/client/hooks/useScrollSpy.js';

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

describe('pickFocusedId', () => {
  const CH = 400; // clientHeight; band line at 35% = 140px
  const SH = 2000;
  const positions = [
    { id: 'a', top: 0 },
    { id: 'b', top: 300 },
    { id: 'c', top: 800 },
  ];

  it('uses the documented top-third anchor fraction', () => {
    expect(FOCUS_BAND_FRACTION).toBe(0.35);
  });

  it('snaps to first heading at the scroll-top boundary', () => {
    expect(pickFocusedId(positions, 0, CH, SH)).toBe('a');
    expect(pickFocusedId(positions, -10, CH, SH)).toBe('a');
  });

  it('snaps to last heading at the scroll-bottom boundary', () => {
    // Last heading at 1950 — never crosses the band on its own; snap fires.
    const shortDoc = [
      { id: 'a', top: 0 },
      { id: 'b', top: 500 },
      { id: 'c', top: 1950 },
    ];
    expect(pickFocusedId(shortDoc, 1600, CH, 2000)).toBe('c');
  });

  it('keeps the current section focused while reading down its body', () => {
    // scrollTop 100, band = 100 + 140 = 240. Only "a" (top 0) has crossed.
    // We're reading body content of "a"; focus stays on "a".
    expect(pickFocusedId(positions, 100, CH, SH)).toBe('a');
  });

  it('rolls forward as soon as the next heading enters the reading band', () => {
    // scrollTop 170, band = 310. Heading "b" at 300 just crossed — focus
    // hands off to "b" the instant its title is in the reading zone.
    expect(pickFocusedId(positions, 170, CH, SH)).toBe('b');
  });

  it('does not roll forward while the next heading is still below the band', () => {
    // scrollTop 155, band = 295. "b" at 300 is just below the band line —
    // focus stays on "a" (you're not reading b yet).
    expect(pickFocusedId(positions, 155, CH, SH)).toBe('a');
  });

  it('handles consecutive sections inside the band by picking the deepest crossed', () => {
    // scrollTop 700, band = 840. Both "b" (300) and "c" (800) have crossed.
    // The most recent one wins — that's what's at the reading zone.
    expect(pickFocusedId(positions, 700, CH, SH)).toBe('c');
  });

  it('disagrees with pickActiveId at section boundaries (the point of the split)', () => {
    // scrollTop 200: "b" at 300 is below viewport top (top is at scrollTop+0
    // ≈ 200). pickActiveId waits for the heading to scroll past the top edge.
    // pickFocusedId, with band at 340, already includes "b" — that's the
    // section the reader's eyes are on.
    const active = pickActiveId(positions, 200, CH, SH);
    const focused = pickFocusedId(positions, 200, CH, SH);
    expect(active).toBe('a');
    expect(focused).toBe('b');
  });

  it('returns null for empty list', () => {
    expect(pickFocusedId([], 0, CH, SH)).toBeNull();
  });
});
