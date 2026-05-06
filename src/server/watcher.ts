import { EventEmitter } from 'node:events';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { WatchEvent } from '../shared/types.js';

export interface Watcher {
  on(event: 'event', listener: (e: WatchEvent) => void): void;
  off(event: 'event', listener: (e: WatchEvent) => void): void;
  close(): Promise<void>;
}

export function createWatcher(rootAbsPath: string): Watcher {
  const emitter = new EventEmitter();

  const watcher: FSWatcher = chokidar.watch(rootAbsPath, {
    ignoreInitial: true,
    ignored: (p: string) => /(^|[\/\\])\../.test(path.basename(p)) || /node_modules/.test(p),
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 60, pollInterval: 30 },
  });

  function emit(kind: WatchEvent['kind'], abs: string) {
    const rel = path.relative(rootAbsPath, abs).split(path.sep).join('/');
    if (!rel) return;
    emitter.emit('event', { kind, relPath: rel } satisfies WatchEvent);
  }

  watcher.on('change', (p) => emit('change', p));
  watcher.on('add', (p) => emit('add', p));
  watcher.on('unlink', (p) => emit('unlink', p));

  return {
    on: (event, listener) => emitter.on(event, listener),
    off: (event, listener) => emitter.off(event, listener),
    close: () => watcher.close(),
  };
}
