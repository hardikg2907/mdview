import { describe, it, expect } from 'vitest';
import { LoopGuard } from '../../src/editor/cursorSync';

describe('LoopGuard', () => {
  it('does not suppress before any inbound position is applied', () => {
    const guard = new LoopGuard(250, () => 1000);
    expect(guard.shouldSkipOutbound()).toBe(false);
  });

  it('suppresses outbound events inside the window after suppressOutbound', () => {
    let now = 1000;
    const guard = new LoopGuard(250, () => now);
    guard.suppressOutbound();
    now = 1100; // 100ms later, inside the 250ms window
    expect(guard.shouldSkipOutbound()).toBe(true);
  });

  it('stops suppressing once the window has elapsed', () => {
    let now = 1000;
    const guard = new LoopGuard(250, () => now);
    guard.suppressOutbound();
    now = 1300; // 300ms later, past the window
    expect(guard.shouldSkipOutbound()).toBe(false);
  });

  it('treats the exact window boundary as expired (now < suppressUntil)', () => {
    let now = 1000;
    const guard = new LoopGuard(250, () => now);
    guard.suppressOutbound();
    now = 1250; // exactly at the boundary
    expect(guard.shouldSkipOutbound()).toBe(false);
  });

  it('re-arms the window on a second suppressOutbound', () => {
    let now = 1000;
    const guard = new LoopGuard(250, () => now);
    guard.suppressOutbound();
    now = 1200;
    guard.suppressOutbound(); // re-arm at 1200 -> window now ends at 1450
    now = 1400;
    expect(guard.shouldSkipOutbound()).toBe(true);
  });
});
