import { describe, expect, it } from 'vitest';
import { Limiter, LimiterAbortError } from '../../src/server/fs/limiter.js';

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

/** Runs `onGrant` when the request is granted, and passes the release through. */
function whenGranted(p: Promise<() => void>, onGrant: () => void): Promise<() => void> {
  return p.then((release) => {
    onGrant();
    return release;
  });
}

describe('Limiter', () => {
  it('grants up to its capacity and queues the rest in order', async () => {
    const l = new Limiter(2);
    const granted: number[] = [];
    const releases = await Promise.all([l.acquire(), l.acquire()]);
    const later = [1, 2, 3].map((n) =>
      l.acquire().then((release) => {
        granted.push(n);
        return release;
      }),
    );
    await tick();
    expect(l.inUse).toBe(2);
    expect(l.waiting).toBe(3);
    expect(granted).toEqual([]);

    releases[0]?.();
    await tick();
    expect(granted).toEqual([1]);
    releases[1]?.();
    await tick();
    expect(granted).toEqual([1, 2]);
    for (const release of await Promise.all(later.slice(0, 2))) release();
    await tick();
    expect(granted).toEqual([1, 2, 3]);
    (await later[2])?.();
    expect(l.inUse).toBe(0);
  });

  it('counts weights, and serves waiters first come first served', async () => {
    const l = new Limiter(10);
    const big = await l.acquire(8);
    const order: string[] = [];
    const heavy = whenGranted(l.acquire(5), () => order.push('heavy'));
    const light = whenGranted(l.acquire(1), () => order.push('light'));
    await tick();
    // `light` would fit, but it may not overtake `heavy`.
    expect(order).toEqual([]);
    big();
    await tick();
    expect(order).toEqual(['heavy', 'light']);
    expect(l.inUse).toBe(6);
    (await heavy)();
    (await light)();
    expect(l.inUse).toBe(0);
  });

  it('grants a request larger than the capacity once nothing else is held', async () => {
    const l = new Limiter(4);
    const small = await l.acquire(1);
    let granted = false;
    const huge = whenGranted(l.acquire(9), () => {
      granted = true;
    });
    await tick();
    expect(granted).toBe(false);
    small();
    (await huge)();
    expect(granted).toBe(true);
    expect(l.inUse).toBe(0);
  });

  it('drops a queued waiter whose signal fires, and lets the next one in', async () => {
    const l = new Limiter(4);
    const held = await l.acquire(3);
    const ac = new AbortController();
    const blocked = l.acquire(2, ac.signal);
    let lightGranted = false;
    const light = whenGranted(l.acquire(1), () => {
      lightGranted = true;
    });
    await tick();
    expect(l.waiting).toBe(2);
    ac.abort();
    await expect(blocked).rejects.toBeInstanceOf(LimiterAbortError);
    (await light)();
    expect(lightGranted).toBe(true);
    expect(l.waiting).toBe(0);
    held();
    expect(l.inUse).toBe(0);
  });

  it('refuses at once when the signal has already fired', async () => {
    const l = new Limiter(1);
    const ac = new AbortController();
    ac.abort();
    await expect(l.acquire(1, ac.signal)).rejects.toBeInstanceOf(LimiterAbortError);
    expect(l.inUse).toBe(0);
  });

  it('ignores a second call to the same release', async () => {
    const l = new Limiter(2);
    const a = await l.acquire();
    const b = await l.acquire();
    a();
    a();
    expect(l.inUse).toBe(1);
    b();
    expect(l.inUse).toBe(0);
  });
});
