import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';
import type { ServerHandleOpts } from '../../src/server/ServerHandle';

// vi.hoisted ensures spawnMock is initialized before the mock factory runs.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { ServerPool } from '../../src/server/ServerPool';

// Also mock the output module so log() is a spy, not the real vscode channel.
const logMock = vi.fn();
vi.mock('../../src/output', () => ({ log: (...args: unknown[]) => logMock(...args) }));

import { Uri } from '../unit/__mocks__/vscode';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { end: vi.fn() } as unknown as Writable;
  kill = vi.fn().mockReturnValue(true);
}

function emitReady(fake: FakeChild, port = 3000): void {
  const url = `http://127.0.0.1:${port}/`;
  fake.stdout.emit('data', Buffer.from(JSON.stringify({ event: 'ready', url, port }) + '\n'));
}

function makeUri(p: string) {
  return Uri.file(p) as unknown as import('vscode').Uri;
}

function buildOpts(overrides: Partial<ServerHandleOpts> = {}): () => ServerHandleOpts {
  return () => ({
    cliEntryPath: '/fake/mdview.mjs',
    args: ['/some/folder', '--vscode', '--port', '0'],
    ...overrides,
  });
}

let pool: ServerPool;

beforeEach(() => {
  pool = new ServerPool();
  spawnMock.mockClear();
  logMock.mockClear();
});

describe('ServerPool — first start', () => {
  it('resolves with handle and info on a successful start', async () => {
    const fake = new FakeChild();
    spawnMock.mockReturnValueOnce(fake);
    const uri = makeUri('/ws/a');
    const p = pool.getOrStart(uri, buildOpts());
    emitReady(fake, 4000);
    const { handle, info } = await p;
    expect(info.port).toBe(4000);
    expect(info.url).toBe('http://127.0.0.1:4000/');
    expect(handle.currentInfo).toEqual(info);
  });
});

describe('ServerPool — second call reuses existing handle', () => {
  it('returns the same handle identity on a second call', async () => {
    const fake = new FakeChild();
    spawnMock.mockReturnValueOnce(fake);
    const uri = makeUri('/ws/b');
    const p1 = pool.getOrStart(uri, buildOpts());
    emitReady(fake, 4001);
    const { handle: h1 } = await p1;
    const { handle: h2 } = await pool.getOrStart(uri, buildOpts());
    expect(h1).toBe(h2);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});

describe('ServerPool — concurrent calls share in-flight start', () => {
  it('spawn is called exactly once for two concurrent getOrStart calls', async () => {
    const fake = new FakeChild();
    spawnMock.mockReturnValueOnce(fake);
    const uri = makeUri('/ws/c');
    // Fire both before awaiting either.
    const p1 = pool.getOrStart(uri, buildOpts());
    const p2 = pool.getOrStart(uri, buildOpts());
    emitReady(fake, 4002);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(r1.handle).toBe(r2.handle);
    expect(r1.info).toEqual(r2.info);
  });
});

describe('ServerPool — disposeFolder', () => {
  it('removes the entry from the map and disposes the handle', async () => {
    const fake = new FakeChild();
    spawnMock.mockReturnValueOnce(fake);
    const uri = makeUri('/ws/d');
    const p = pool.getOrStart(uri, buildOpts());
    emitReady(fake, 4003);
    const { handle } = await p;
    expect(pool.has(uri)).toBe(true);
    pool.disposeFolder(uri);
    expect(pool.has(uri)).toBe(false);
    expect(fake.kill).toHaveBeenCalled();
    // Ensure the underlying handle's dispose was called (no crash on double-dispose).
    expect(() => handle.dispose()).not.toThrow();
  });

  it('is a no-op for an unknown uri', () => {
    expect(() => pool.disposeFolder(makeUri('/ws/unknown'))).not.toThrow();
  });
});

describe('ServerPool — disposeAll', () => {
  it('disposes every handle and clears the map', async () => {
    const fakeA = new FakeChild();
    const fakeB = new FakeChild();
    spawnMock.mockReturnValueOnce(fakeA).mockReturnValueOnce(fakeB);
    const uriA = makeUri('/ws/e1');
    const uriB = makeUri('/ws/e2');
    const pA = pool.getOrStart(uriA, buildOpts());
    emitReady(fakeA, 4010);
    await pA;
    const pB = pool.getOrStart(uriB, buildOpts());
    emitReady(fakeB, 4011);
    await pB;
    expect(pool.size).toBe(2);
    pool.disposeAll();
    expect(pool.size).toBe(0);
    expect(fakeA.kill).toHaveBeenCalled();
    expect(fakeB.kill).toHaveBeenCalled();
  });
});

describe('ServerPool — crash removes pool entry', () => {
  it('removes the handle when onExit fires after a ready', async () => {
    const fake = new FakeChild();
    spawnMock.mockReturnValueOnce(fake);
    const uri = makeUri('/ws/f');
    const p = pool.getOrStart(uri, buildOpts());
    emitReady(fake, 4020);
    await p;
    expect(pool.has(uri)).toBe(true);
    // Simulate unexpected child exit.
    fake.emit('exit', 1, null);
    expect(pool.has(uri)).toBe(false);
  });

  it('invokes the caller-supplied onExit when crash removes from pool', async () => {
    const userOnExit = vi.fn();
    const fake = new FakeChild();
    spawnMock.mockReturnValueOnce(fake);
    const uri = makeUri('/ws/g');
    const p = pool.getOrStart(uri, buildOpts({ onExit: userOnExit }));
    emitReady(fake, 4021);
    await p;
    fake.emit('exit', 2, null);
    expect(userOnExit).toHaveBeenCalledTimes(1);
    expect(userOnExit).toHaveBeenCalledWith(2, null);
  });
});

describe('ServerPool — soft cap warning', () => {
  it('logs a warning when size is at SOFT_CAP before adding the next', async () => {
    // Fill 8 slots.
    for (let i = 0; i < 8; i++) {
      const fake = new FakeChild();
      spawnMock.mockReturnValueOnce(fake);
      const uri = makeUri(`/ws/cap${i}`);
      const p = pool.getOrStart(uri, buildOpts());
      emitReady(fake, 5000 + i);
      await p;
    }
    expect(pool.size).toBe(8);
    expect(logMock).not.toHaveBeenCalledWith(expect.stringContaining('live servers'));

    // 9th slot should trigger the warning.
    const fake9 = new FakeChild();
    spawnMock.mockReturnValueOnce(fake9);
    const uri9 = makeUri('/ws/cap8');
    const p9 = pool.getOrStart(uri9, buildOpts());
    emitReady(fake9, 5008);
    await p9;
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('live servers'));
  });
});
