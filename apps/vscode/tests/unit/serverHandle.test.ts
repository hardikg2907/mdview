import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';

// vi.hoisted ensures spawnMock is initialized before the mock factory runs.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { ServerHandle, bundledCliEntry } from '../../src/server/ServerHandle';

// A minimal fake of the pieces of ChildProcess that ServerHandle uses.
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { end: vi.fn() } as unknown as Writable;
  kill = vi.fn().mockReturnValue(true);
}

function makeHandle(
  opts: {
    args?: string[];
    onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  } = {},
): { handle: ServerHandle; fake: FakeChild } {
  const fake = new FakeChild();
  spawnMock.mockReturnValueOnce(fake);
  const handle = new ServerHandle({
    cliEntryPath: '/fake/mdview.mjs',
    args: opts.args ?? [],
    onExit: opts.onExit,
  });
  return { handle, fake };
}

function emitReady(fake: FakeChild, port = 3456): void {
  const url = `http://127.0.0.1:${port}/`;
  fake.stdout.emit('data', Buffer.from(JSON.stringify({ event: 'ready', url, port }) + '\n'));
}

beforeEach(() => {
  vi.useFakeTimers();
  spawnMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ServerHandle — happy path', () => {
  it('resolves with port and url when ready line arrives', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    emitReady(fake, 4567);
    const info = await p;
    expect(info.port).toBe(4567);
    expect(info.url).toBe('http://127.0.0.1:4567/');
  });

  it('exposes currentInfo after start resolves', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    emitReady(fake, 9000);
    await p;
    expect(handle.currentInfo).toEqual({ port: 9000, url: 'http://127.0.0.1:9000/' });
  });

  it('uses process.execPath and shell:false when spawning', async () => {
    const { handle, fake } = makeHandle({ args: ['--port', '0'] });
    const p = handle.start();
    emitReady(fake);
    await p;
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      ['/fake/mdview.mjs', '--port', '0'],
      expect.objectContaining({ shell: false }),
    );
  });
});

describe('ServerHandle — malformed ready payload', () => {
  it('rejects and kills child on non-JSON first line', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    fake.stdout.emit('data', Buffer.from('not json at all\n'));
    await expect(p).rejects.toThrow(/not valid JSON/);
    expect(fake.kill).toHaveBeenCalled();
  });

  it('rejects on wrong event field', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    fake.stdout.emit('data', Buffer.from(JSON.stringify({ event: 'started', port: 3000, url: 'http://127.0.0.1:3000/' }) + '\n'));
    await expect(p).rejects.toThrow(/unexpected ready payload/);
    expect(fake.kill).toHaveBeenCalled();
  });

  it('rejects when port is 0', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    fake.stdout.emit('data', Buffer.from(JSON.stringify({ event: 'ready', port: 0, url: 'http://127.0.0.1:0/' }) + '\n'));
    await expect(p).rejects.toThrow(/unexpected ready payload/);
    expect(fake.kill).toHaveBeenCalled();
  });

  it('rejects when port is > 65535', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    fake.stdout.emit('data', Buffer.from(JSON.stringify({ event: 'ready', port: 99999, url: 'http://127.0.0.1:99999/' }) + '\n'));
    await expect(p).rejects.toThrow(/unexpected ready payload/);
  });

  it('rejects when port is a float', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    fake.stdout.emit('data', Buffer.from(JSON.stringify({ event: 'ready', port: 3000.5, url: 'http://127.0.0.1:3000/' }) + '\n'));
    await expect(p).rejects.toThrow(/unexpected ready payload/);
  });

  it('rejects when url does not start with http://127.0.0.1:<port>/', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    fake.stdout.emit('data', Buffer.from(JSON.stringify({ event: 'ready', port: 3000, url: 'http://1.2.3.4:3000/' }) + '\n'));
    await expect(p).rejects.toThrow(/unexpected ready payload/);
    expect(fake.kill).toHaveBeenCalled();
  });
});

describe('ServerHandle — timeout', () => {
  it('rejects after 10s with no ready line and kills child', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    vi.advanceTimersByTime(10_001);
    await expect(p).rejects.toThrow(/timed out/);
    expect(fake.kill).toHaveBeenCalled();
  });
});

describe('ServerHandle — buffer cap', () => {
  it('rejects and kills when stdout exceeds 64 KiB with no newline', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    // Emit 65 KiB of data without a newline.
    fake.stdout.emit('data', Buffer.alloc(65 * 1024, 'x'));
    await expect(p).rejects.toThrow(/too much output/);
    expect(fake.kill).toHaveBeenCalled();
  });
});

describe('ServerHandle — pre-ready exit', () => {
  it('rejects when child exits before emitting ready', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    fake.emit('exit', 1, null);
    await expect(p).rejects.toThrow(/exited before ready/);
  });
});

describe('ServerHandle — post-ready exit', () => {
  it('fires onExit callback on unexpected exit after ready', async () => {
    const onExit = vi.fn();
    const { handle, fake } = makeHandle({ onExit });
    const p = handle.start();
    emitReady(fake, 5000);
    await p;
    fake.emit('exit', 1, null);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith(1, null);
  });

  it('does NOT fire onExit after explicit dispose()', async () => {
    const onExit = vi.fn();
    const { handle, fake } = makeHandle({ onExit });
    const p = handle.start();
    emitReady(fake, 5001);
    await p;
    handle.dispose();
    fake.emit('exit', 0, null);
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe('ServerHandle — idempotent dispose', () => {
  it('calling dispose() twice does not throw', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    emitReady(fake, 5002);
    await p;
    handle.dispose();
    expect(() => handle.dispose()).not.toThrow();
  });

  it('kill is called at most once across two dispose() calls', async () => {
    const { handle, fake } = makeHandle();
    const p = handle.start();
    emitReady(fake, 5003);
    await p;
    handle.dispose();
    handle.dispose();
    expect(fake.kill).toHaveBeenCalledTimes(1);
  });
});

describe('bundledCliEntry', () => {
  it('returns production path when NODE_ENV is not development', () => {
    const result = bundledCliEntry('/ext');
    // In test environment NODE_ENV is typically not 'development', or
    // MDVIEW_CLI_PATH is not set; either way should return the prod path.
    // We can at least verify the prod path suffix is present when env var unset.
    const originalCliPath = process.env['MDVIEW_CLI_PATH'];
    delete process.env['MDVIEW_CLI_PATH'];
    const result2 = bundledCliEntry('/ext');
    expect(result2).toContain('mdview.mjs');
    if (originalCliPath !== undefined) process.env['MDVIEW_CLI_PATH'] = originalCliPath;
    void result;
  });
});
