import { describe, it, expect } from 'vitest';
import { pickFocusedIndex } from '../../src/client/hooks/useFocusedSection.js';

describe('pickFocusedIndex', () => {
  const H = 400; // clientHeight

  it('returns -1 for empty list', () => {
    expect(pickFocusedIndex([], 0, H, 1000)).toBe(-1);
  });

  it('picks first heading at the top of a scrollable doc', () => {
    // Doc 2000px, viewport 400, headings at 0, 800, 1600.
    expect(pickFocusedIndex([0, 800, 1600], 0, H, 2000)).toBe(0);
  });

  it('picks last heading at the bottom of a scrollable doc even when the last section is shorter than half the viewport', () => {
    // Doc 1000px, viewport 400, max scroll = 600. Last heading at 950
    // (only 50px before doc end — far less than H/2 = 200).
    // With the old fixed-center logic, max centerY = 600+200 = 800 < 950,
    // so the last heading could never be selected.
    expect(pickFocusedIndex([0, 500, 950], 600, H, 1000)).toBe(2);
  });

  it('picks the first heading even when the second heading is within H/2 of it', () => {
    // Headings at 50 and 100 (50px apart, viewport center=200 at top). With
    // the old center logic, at scrollTop=0 centerY=200 >= both tops, so
    // activeIdx = 1 — the first heading was never the active one.
    expect(pickFocusedIndex([50, 100, 800], 0, H, 1500)).toBe(0);
  });

  it('interpolates smoothly between top and bottom', () => {
    // Doc 2000, viewport 400, maxScroll = 1600. Headings at 0, 800, 1600.
    // Halfway scroll (800): focusY = 800 + 400 * (800/1600) = 800 + 200 = 1000.
    // tops <= 1000 → 0 and 800; last is idx 1.
    expect(pickFocusedIndex([0, 800, 1600], 800, H, 2000)).toBe(1);
  });

  it('uses the fixed center when the document fits in the viewport (no scroll possible)', () => {
    // scrollHeight == clientHeight → maxScroll = 0 → fallback to center.
    // Center = 200. Headings at 0, 100, 300. tops <= 200 → 0 and 100; last is idx 1.
    expect(pickFocusedIndex([0, 100, 300], 0, H, 400)).toBe(1);
  });

  it('still falls back to the first heading when all heading tops are above focusY at scrollTop=0', () => {
    // First heading at 500, viewport top focus line at 0. None match — fall back to 0.
    expect(pickFocusedIndex([500, 900], 0, H, 1500)).toBe(0);
  });
});
