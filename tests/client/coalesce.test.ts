import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coalesce } from '../../src/client/lib/coalesce.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('coalesce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the task once after a burst, measured from the last request', async () => {
    const task = vi.fn(async () => {});
    const c = coalesce(task, 150);

    for (let i = 0; i < 300; i++) {
      c.request();
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(task).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(150);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('runs exactly one follow-up for requests that arrive while the task is running', async () => {
    const gates = [deferred(), deferred(), deferred()];
    let call = 0;
    const task = vi.fn(() => gates[call++]!.promise);
    const c = coalesce(task, 150);

    c.request();
    await vi.advanceTimersByTimeAsync(150);
    expect(task).toHaveBeenCalledTimes(1);

    // The debounce settles while the first fetch is still in flight.
    c.request();
    await vi.advanceTimersByTimeAsync(150);
    c.request();
    await vi.advanceTimersByTimeAsync(150);
    expect(task).toHaveBeenCalledTimes(1);

    gates[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(2);

    gates[1]!.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('lets a still-pending timer start the follow-up instead of running it twice', async () => {
    const gate = deferred();
    const task = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(undefined);
    const c = coalesce(task, 150);

    c.request();
    await vi.advanceTimersByTimeAsync(150);
    expect(task).toHaveBeenCalledTimes(1);

    c.request();
    await vi.advanceTimersByTimeAsync(50);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('does not run a follow-up when nothing was requested during the task', async () => {
    const task = vi.fn(async () => {});
    const c = coalesce(task, 150);

    c.request();
    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(1000);

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('keeps working after a task fails', async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const c = coalesce(task, 150);

    c.request();
    await vi.advanceTimersByTimeAsync(150);
    c.request();
    await vi.advanceTimersByTimeAsync(150);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('cancel drops a pending run', async () => {
    const task = vi.fn(async () => {});
    const c = coalesce(task, 150);

    c.request();
    c.cancel();
    await vi.advanceTimersByTimeAsync(1000);

    expect(task).not.toHaveBeenCalled();
  });
});
