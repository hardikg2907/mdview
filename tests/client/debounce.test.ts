import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../src/client/lib/debounce.js';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once on the trailing edge after the delay', () => {
    const fn = vi.fn<(x: number) => void>();
    const d = debounce(fn, 100);
    d(1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('coalesces rapid calls and forwards the latest arguments', () => {
    const fn = vi.fn<(s: string) => void>();
    const d = debounce(fn, 50);
    d('a');
    vi.advanceTimersByTime(20);
    d('b');
    vi.advanceTimersByTime(20);
    d('c');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('cancel() drops a pending invocation', () => {
    const fn = vi.fn<() => void>();
    const d = debounce(fn, 50);
    d();
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush() runs the pending call immediately with last args', () => {
    const fn = vi.fn<(x: number, y: number) => void>();
    const d = debounce(fn, 100);
    d(1, 2);
    d(3, 4);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3, 4);
    // and timer cleared — no second fire
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() is a no-op when nothing is pending', () => {
    const fn = vi.fn<() => void>();
    const d = debounce(fn, 50);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
    d();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
