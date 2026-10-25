import { Worker } from 'node:worker_threads';
import type { FileMatches, MatchRequest, MatchResponse } from './regex-worker.js';

// The bundle puts the worker beside bin/mdview.mjs; the test runner loads the
// TypeScript source next to this file instead.
const WORKER_URL = new URL(
  import.meta.url.endsWith('.ts') ? './regex-worker.ts' : './regex-worker.mjs',
  import.meta.url,
);

/** The search used up its matching budget; the worker was terminated. */
export class RegexTimeoutError extends Error {}

/** The caller's signal fired while the worker was matching. */
export class RegexAbortError extends Error {}

// One warm worker is kept between searches. A search that finds none idle gets
// a fresh one, so concurrent searches never share a thread, and terminating
// one search's worker cannot cut another search short.
let idle: Worker | null = null;
let nextId = 1;

// Searches can be fired by any page the user opens (an <img> per query in a
// rendered document), so threads are capped and later searches queue for one.
const MAX_ACTIVE_WORKERS = 2;
let active = 0;
const waiting: Array<() => void> = [];

function acquireSlot(signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return Promise.reject(new RegexAbortError('Search aborted'));
  if (active < MAX_ACTIVE_WORKERS) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const grant = (): void => {
      signal?.removeEventListener('abort', onAbort);
      active++;
      resolve();
    };
    const onAbort = (): void => {
      const i = waiting.indexOf(grant);
      if (i >= 0) waiting.splice(i, 1);
      reject(new RegexAbortError('Search aborted'));
    };
    waiting.push(grant);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function releaseSlot(): void {
  active--;
  waiting.shift()?.();
}

function spawn(): Worker {
  const worker = new Worker(WORKER_URL);
  // An idle worker must not keep the process alive on its own.
  worker.unref();
  // A worker that dies while idle must not be handed to the next search, and an
  // 'error' with no listener would take the whole server down. Errors during a
  // match are reported through that match's own listener.
  worker.on('error', () => undefined);
  worker.once('exit', () => {
    if (idle === worker) idle = null;
  });
  return worker;
}

/** Terminate the idle worker. Called when the server closes. */
export async function closeRegexWorkers(): Promise<void> {
  const w = idle;
  idle = null;
  if (w) await w.terminate();
}

export interface RegexSessionOptions {
  source: string;
  flags: string;
  maxLineLen: number;
  perFileCap: number;
  /** Total wall-clock time the worker may spend matching for this session. */
  budgetMs: number;
  signal?: AbortSignal;
}

export interface RegexSession {
  /** Match a batch of file bodies. Rejects with RegexTimeoutError or RegexAbortError. */
  match(files: string[]): Promise<FileMatches[]>;
  /** Hand the worker back for reuse, or terminate it. Always call once. */
  release(): void;
}

export function openRegexSession(opts: RegexSessionOptions): RegexSession {
  let worker: Worker | null = null;
  let slot: Promise<void> | null = null;
  let holdsSlot = false;
  let spentMs = 0;

  async function ready(): Promise<void> {
    if (!slot) {
      slot = acquireSlot(opts.signal).then(() => {
        holdsSlot = true;
        worker = idle ?? spawn();
        idle = null;
      });
    }
    await slot;
  }

  function kill(): void {
    const w = worker;
    worker = null;
    void w?.terminate();
  }

  return {
    async match(files) {
      await ready();
      const w = worker;
      if (!w) return Promise.reject(new RegexTimeoutError('Regex worker is gone'));
      const remaining = opts.budgetMs - spentMs;
      if (remaining <= 0) {
        kill();
        return Promise.reject(new RegexTimeoutError('Regex search budget used up'));
      }
      if (opts.signal?.aborted) {
        kill();
        return Promise.reject(new RegexAbortError('Search aborted'));
      }

      const id = nextId++;
      const started = performance.now();
      return new Promise<FileMatches[]>((resolve, reject) => {
        const cleanup = (): void => {
          clearTimeout(timer);
          w.off('message', onMessage);
          w.off('error', onError);
          w.off('exit', onExit);
          opts.signal?.removeEventListener('abort', onAbort);
          spentMs += performance.now() - started;
        };
        const onMessage = (res: MatchResponse): void => {
          if (res.id !== id) return;
          cleanup();
          if (res.ok) resolve(res.files);
          else reject(new Error('Regex worker could not run the pattern'));
        };
        const onError = (err: Error): void => {
          cleanup();
          worker = null;
          reject(err);
        };
        const onExit = (): void => {
          cleanup();
          worker = null;
          reject(new Error('Regex worker exited'));
        };
        const onAbort = (): void => {
          cleanup();
          kill();
          reject(new RegexAbortError('Search aborted'));
        };
        // The only way to stop a runaway exec() is to end the thread it runs on.
        const timer = setTimeout(() => {
          cleanup();
          kill();
          reject(new RegexTimeoutError('Regex search budget used up'));
        }, remaining);

        w.on('message', onMessage);
        w.on('error', onError);
        w.on('exit', onExit);
        opts.signal?.addEventListener('abort', onAbort, { once: true });
        const req: MatchRequest = {
          id,
          source: opts.source,
          flags: opts.flags,
          maxLineLen: opts.maxLineLen,
          perFileCap: opts.perFileCap,
          files,
        };
        w.postMessage(req);
      });
    },

    release() {
      const w = worker;
      worker = null;
      if (w) {
        if (idle) void w.terminate();
        else idle = w;
      }
      if (holdsSlot) {
        holdsSlot = false;
        releaseSlot();
      }
    },
  };
}
