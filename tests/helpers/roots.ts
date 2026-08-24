import path from 'node:path';
import { buildIgnoreSet } from '../../src/server/fs/ignore.js';
import type { Watcher } from '../../src/server/watcher.js';
import type { RootState } from '../../src/server/workspace.js';
import type { ProjectConfig } from '../../src/shared/types.js';

/**
 * A Watcher that does nothing. Route tests care about path resolution, not file
 * events, and a real chokidar instance per test would cost fd churn and teardown.
 */
export function stubWatcher(): Watcher {
  return {
    on: () => undefined,
    off: () => undefined,
    emitSynthetic: () => undefined,
    close: async () => undefined,
  };
}

export interface FakeRootOptions {
  id?: string;
  name?: string;
  kind?: 'file' | 'dir';
  filePath?: string;
  config?: ProjectConfig | null;
  ignore?: string[];
}

/** Build a RootState over a real directory for route-level tests. */
export function fakeRoot(absPath: string, opts: FakeRootOptions = {}): RootState {
  const id = opts.id ?? path.basename(absPath).toLowerCase();
  return {
    root: {
      id,
      name: opts.name ?? path.basename(absPath),
      kind: opts.kind ?? 'dir',
      filePath: opts.filePath ?? '',
    },
    absPath,
    ignoreSet: buildIgnoreSet(opts.ignore ?? []),
    config: opts.config ?? null,
    watcher: stubWatcher(),
  };
}
