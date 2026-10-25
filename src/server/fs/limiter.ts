/** The caller's signal fired while it was still waiting for its turn. */
export class LimiterAbortError extends Error {}

interface Waiter {
  weight: number;
  grant: () => void;
}

/**
 * A weighted, first-come-first-served semaphore. Each holder takes `weight`
 * units of `capacity` until it calls the release function it was given.
 *
 * Waiters are served strictly in order, so a heavy request cannot be starved
 * by a stream of light ones. A request heavier than the whole capacity is
 * still granted once nothing else is held, rather than waiting forever.
 */
export class Limiter {
  private used = 0;
  private readonly queue: Waiter[] = [];

  constructor(private readonly capacity: number) {}

  /** Units currently held. */
  get inUse(): number {
    return this.used;
  }

  /** Requests waiting for their turn. */
  get waiting(): number {
    return this.queue.length;
  }

  acquire(weight = 1, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new LimiterAbortError('Aborted while queued'));
    if (this.queue.length === 0 && this.fits(weight)) {
      return Promise.resolve(this.take(weight));
    }
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        const i = this.queue.indexOf(waiter);
        if (i >= 0) this.queue.splice(i, 1);
        reject(new LimiterAbortError('Aborted while queued'));
        // The waiter that left may have been the one holding up the queue.
        this.drain();
      };
      const waiter: Waiter = {
        weight,
        grant: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve(this.take(weight));
        },
      };
      this.queue.push(waiter);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private fits(weight: number): boolean {
    return this.used === 0 || this.used + weight <= this.capacity;
  }

  private take(weight: number): () => void {
    this.used += weight;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.used -= weight;
      this.drain();
    };
  }

  private drain(): void {
    for (let head = this.queue[0]; head && this.fits(head.weight); head = this.queue[0]) {
      this.queue.shift();
      head.grant();
    }
  }
}
