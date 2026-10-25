import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWatcher, type Watcher } from '../../src/server/watcher.js';
import type { WatchEvent } from '../../src/shared/types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return true;
    await sleep(25);
  }
  return check();
}

describe.skipIf(process.platform === 'win32')('createWatcher (symlinks)', () => {
  let base: string;
  let watcher: Watcher;
  const events: WatchEvent[] = [];

  beforeAll(async () => {
    base = mkdtempSync(path.join(tmpdir(), 'mdview-watch-'));
    const root = path.join(base, 'root');
    mkdirSync(root);
    mkdirSync(path.join(base, 'outside'));
    symlinkSync(path.join(base, 'outside'), path.join(root, 'link'));
    watcher = createWatcher(root, { prefix: 'w' });
    watcher.on('event', (e) => events.push(e));
    // chokidar has no ready signal through this interface; give the initial
    // scan time to finish.
    await sleep(400);
  });

  afterAll(async () => {
    await watcher.close();
    rmSync(base, { recursive: true, force: true });
  });

  it('does not descend into a directory link that leaves the root', async () => {
    writeFileSync(path.join(base, 'outside', 'far.md'), '# far');
    writeFileSync(path.join(base, 'root', 'near.md'), '# near');
    expect(await waitFor(() => events.some((e) => 'relPath' in e && e.relPath === 'w/near.md'), 3000)).toBe(true);
    await sleep(300);
    expect(events.some((e) => 'relPath' in e && e.relPath.startsWith('w/link/'))).toBe(false);
  });
});
