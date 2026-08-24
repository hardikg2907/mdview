import { EventEmitter } from 'node:events';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { WatchEvent } from '../shared/types.js';
import { DEFAULT_IGNORED_DIRS, isPathIgnored } from './fs/ignore.js';

export interface Watcher {
  on(event: 'event', listener: (e: WatchEvent) => void): void;
  off(event: 'event', listener: (e: WatchEvent) => void): void;
  /** Emit an event that didn't come from chokidar (e.g. config reload). */
  emitSynthetic(e: WatchEvent): void;
  close(): Promise<void>;
}

export interface CreateWatcherOptions {
  /** Directory basenames to skip recursively. Defaults to DEFAULT_IGNORED_DIRS. */
  ignore?: ReadonlySet<string>;
  /**
   * Root id to prefix emitted relPaths with, so events from several roots stay
   * distinguishable on the one SSE stream.
   */
  prefix?: string;
}

/**
 * A Watcher with no filesystem of its own — every root forwards its events into
 * one of these and the SSE route subscribes only to it.
 *
 * The indirection is what lets roots come and go while tabs stay open: a client
 * that subscribed to each root's watcher directly would never hear from a root
 * opened after it connected.
 */
export function createEventHub(): Watcher {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    on: (event, listener) => emitter.on(event, listener),
    off: (event, listener) => emitter.off(event, listener),
    emitSynthetic: (e) => emitter.emit('event', e),
    close: async () => {
      emitter.removeAllListeners();
    },
  };
}

export function createWatcher(rootAbsPath: string, opts: CreateWatcherOptions = {}): Watcher {
  const emitter = new EventEmitter();
  // SSE clients each register one listener; the count is bounded by real
  // browser tabs, not by Node's default warning threshold of 10. Without this,
  // opening a few tabs (or a flaky reconnect loop) triggers
  // MaxListenersExceededWarning and looks like a leak when it isn't.
  emitter.setMaxListeners(0);
  const ignore = opts.ignore ?? DEFAULT_IGNORED_DIRS;
  const prefix = opts.prefix ?? '';

  const watcher: FSWatcher = chokidar.watch(rootAbsPath, {
    ignoreInitial: true,
    ignored: (p: string) => isPathIgnored(p, rootAbsPath, ignore),
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 60, pollInterval: 30 },
  });

  // EMFILE / ENOSPC at startup is the common failure when running mdview at a
  // repo root with heavy build dirs that slipped past `ignored`. Surface a
  // helpful hint instead of an uncaught error that crashes the process.
  watcher.on('error', (err: unknown) => {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === 'EMFILE' || e?.code === 'ENOSPC') {
      console.error(
        `[mdview] file watcher hit ${e.code} while watching ${rootAbsPath}\n` +
          `  Path: ${e.path ?? '(unknown)'}\n` +
          `  Likely cause: a heavy directory (build output, deps) wasn't ignored.\n` +
          `  Fix: add the directory name to "ignore" in ~/.config/mdview/config.json, e.g.\n` +
          `    { "ignore": ["deps", "_site"] }\n` +
          `  Built-in skips already cover ${[...DEFAULT_IGNORED_DIRS].join(', ')}.`,
      );
    } else {
      console.error(`[mdview] watcher error: ${e?.message ?? String(err)}`);
    }
  });

  function emit(kind: 'change' | 'add' | 'unlink', abs: string) {
    // Normalize to URL-shaped relPath ('/'-separated) on every OS so Windows
    // (`\`) events match the same wire format the rest of the API serves.
    const rel = path.relative(rootAbsPath, abs).split(path.sep).join('/');
    if (!rel) return;
    const relPath = prefix ? `${prefix}/${rel}` : rel;
    emitter.emit('event', { kind, relPath } satisfies WatchEvent);
  }

  watcher.on('change', (p) => emit('change', p));
  watcher.on('add', (p) => emit('add', p));
  watcher.on('unlink', (p) => emit('unlink', p));

  return {
    on: (event, listener) => emitter.on(event, listener),
    off: (event, listener) => emitter.off(event, listener),
    emitSynthetic: (e) => emitter.emit('event', e),
    close: () => watcher.close(),
  };
}
