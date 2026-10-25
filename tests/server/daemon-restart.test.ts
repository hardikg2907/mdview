import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureDaemon, probeHealth } from '../../src/daemon/client.js';
import {
  readDaemonState,
  releaseSpawnLock,
  tryTakeSpawnLock,
  writeDaemonState,
} from '../../src/daemon/state.js';
import { registerHealth } from '../../src/server/routes/health.js';

let home: string;
let previousXdg: string | undefined;
let fakes: FastifyInstance[];

interface Fake {
  app: FastifyInstance;
  port: number;
  pid: number;
  startedAt: number;
}

/** A stand-in for a daemon: answers /api/health, and nothing else. */
async function startFake(report: {
  pid: number;
  startedAt: number;
  version?: string;
  record?: boolean;
  recordedPid?: number;
  recordedStartedAt?: number;
}): Promise<Fake> {
  const app = Fastify({ logger: false });
  app.get('/api/health', async (_req, reply) =>
    reply.send({
      ok: true,
      pid: report.pid,
      startedAt: report.startedAt,
      ...(report.version === undefined ? {} : { version: report.version }),
      roots: ['alpha'],
    }),
  );
  await app.listen({ host: '127.0.0.1', port: 0 });
  fakes.push(app);
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  if (report.record !== false) {
    writeDaemonState({
      pid: report.recordedPid ?? report.pid,
      port,
      startedAt: report.recordedStartedAt ?? report.startedAt,
    });
  }
  return { app, port, pid: report.pid, startedAt: report.startedAt };
}

beforeEach(() => {
  previousXdg = process.env.XDG_CONFIG_HOME;
  home = mkdtempSync(path.join(tmpdir(), 'mdview-restart-'));
  process.env.XDG_CONFIG_HOME = home;
  fakes = [];
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fakes.map((f) => f.close().catch(() => undefined)));
  if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = previousXdg;
  rmSync(home, { recursive: true, force: true });
});

/**
 * Never let a test signal a real process: the fake pids are small numbers that
 * may belong to something live. The spy closes the fake instead, which is what
 * a real SIGTERM would do to the daemon.
 */
function interceptKill(old: Fake) {
  return vi.spyOn(process, 'kill').mockImplementation(((pid: number) => {
    if (pid === old.pid) void old.app.close();
    return true;
  }) as typeof process.kill);
}

describe('/api/health version', () => {
  it('reports the version the daemon was started with', async () => {
    const app = Fastify({ logger: false });
    registerHealth(app, { pid: 7, startedAt: 9, version: '1.2.3' }, []);
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toMatchObject({ ok: true, pid: 7, startedAt: 9, version: '1.2.3', roots: [] });
    await app.close();
  });

  it('is read by the client, and dropped when it is not a plain version', async () => {
    const good = await startFake({ pid: 4242, startedAt: 1, version: '0.11.0' });
    expect((await probeHealth(good.port))?.version).toBe('0.11.0');

    for (const bad of ['\u001b[2J0.11.0', '0.11.0\n', 'latest', '9'.repeat(100)]) {
      const fake = await startFake({ pid: 4242, startedAt: 1, version: bad });
      expect((await probeHealth(fake.port))?.version, JSON.stringify(bad)).toBeUndefined();
    }
  });
});

describe('ensureDaemon version handling', () => {
  it('restarts a daemon running an older version, once, and reports it', async () => {
    const old = await startFake({ pid: 4242, startedAt: 111, version: '0.10.0' });
    const kill = interceptKill(old);
    let fresh: Fake | undefined;
    const spawnFn = vi.fn(() => {
      void startFake({ pid: 5252, startedAt: 222, version: '0.11.0' }).then((f) => {
        fresh = f;
      });
    });
    const onRestart = vi.fn();

    const state = await ensureDaemon('cli.js', { version: '0.11.0', spawnFn, onRestart });

    expect(kill).toHaveBeenCalledTimes(1);
    expect(kill.mock.calls[0]?.[0]).toBe(4242);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledWith('0.10.0', '0.11.0');
    expect(state.pid).toBe(5252);
    expect(state.port).toBe(fresh?.port);
    expect(readDaemonState()?.pid).toBe(5252);
  });

  it('treats a daemon that reports no version (0.10.0 and older) as different', async () => {
    const old = await startFake({ pid: 4242, startedAt: 111 });
    interceptKill(old);
    const onRestart = vi.fn();
    await ensureDaemon('cli.js', {
      version: '0.11.0',
      spawnFn: () => void startFake({ pid: 5252, startedAt: 222, version: '0.11.0' }),
      onRestart,
    });
    expect(onRestart).toHaveBeenCalledWith('unknown', '0.11.0');
  });

  it('restarts a daemon that is newer than the CLI too, so two installs never share one silently', async () => {
    const old = await startFake({ pid: 4242, startedAt: 111, version: '0.12.0' });
    interceptKill(old);
    const onRestart = vi.fn();
    await ensureDaemon('cli.js', {
      version: '0.11.0',
      spawnFn: () => void startFake({ pid: 5252, startedAt: 222, version: '0.11.0' }),
      onRestart,
    });
    expect(onRestart).toHaveBeenCalledWith('0.12.0', '0.11.0');
  });

  it('reuses a daemon on the same version without signalling or spawning', async () => {
    const live = await startFake({ pid: 4242, startedAt: 111, version: '0.11.0' });
    const kill = vi.spyOn(process, 'kill');
    const spawnFn = vi.fn();
    const onRestart = vi.fn();
    const state = await ensureDaemon('cli.js', { version: '0.11.0', spawnFn, onRestart });
    expect(state.port).toBe(live.port);
    expect(kill).not.toHaveBeenCalled();
    expect(spawnFn).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('reuses a daemon when this CLI cannot tell its own version', async () => {
    const live = await startFake({ pid: 4242, startedAt: 111 });
    const kill = vi.spyOn(process, 'kill');
    const spawnFn = vi.fn();
    const state = await ensureDaemon('cli.js', { version: 'unknown', spawnFn });
    expect(state.port).toBe(live.port);
    expect(kill).not.toHaveBeenCalled();
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('never signals a pid it has not verified', async () => {
    // The record names pid 4242, but whatever answers on the port says it is
    // pid 5555: the pid was recycled or the port belongs to somebody else.
    await startFake({ pid: 5555, startedAt: 111, version: '0.10.0', recordedPid: 4242 });
    const kill = vi.spyOn(process, 'kill');
    const onRestart = vi.fn();
    await ensureDaemon('cli.js', {
      version: '0.11.0',
      spawnFn: () => void startFake({ pid: 6262, startedAt: 333, version: '0.11.0' }),
      onRestart,
    });
    expect(kill).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('never signals when the start time does not match the record', async () => {
    await startFake({ pid: 4242, startedAt: 111, version: '0.10.0', recordedStartedAt: 999 });
    const kill = vi.spyOn(process, 'kill');
    await ensureDaemon('cli.js', {
      version: '0.11.0',
      spawnFn: () => void startFake({ pid: 6262, startedAt: 333, version: '0.11.0' }),
    });
    expect(kill).not.toHaveBeenCalled();
  });

  it('waits for the other CLI that holds the lock instead of using, or stopping, the old daemon', async () => {
    const old = await startFake({ pid: 4242, startedAt: 111, version: '0.10.0' });
    const kill = vi.spyOn(process, 'kill');
    const spawnFn = vi.fn();
    expect(tryTakeSpawnLock()).toBe(true);

    const pending = ensureDaemon('cli.js', { version: '0.11.0', spawnFn, startTimeoutMs: 4_000 });
    await new Promise((r) => setTimeout(r, 200));
    // Still on the old daemon: the waiter must not have settled for it.
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(settled).toBe(false);

    // The lock holder finishes its swap.
    await old.app.close();
    const fresh = await startFake({ pid: 5252, startedAt: 222, version: '0.11.0' });
    releaseSpawnLock();

    const state = await pending;
    expect(state.pid).toBe(5252);
    expect(state.port).toBe(fresh.port);
    expect(kill).not.toHaveBeenCalled();
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('does not start a second daemon when one appeared between the look and the lock', async () => {
    // The first probe sees nothing; by the time the lock is ours, a rival CLI
    // has brought a daemon up. It must be reused, not raced.
    const rival = await startFake({ pid: 5252, startedAt: 222, version: '0.11.0', record: false });
    const addr = rival.app.server.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 1;
    const spawnFn = vi.fn();
    let probes = 0;
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      probes++;
      if (probes === 1) throw new Error('refused');
      writeDaemonState({ pid: 5252, port, startedAt: 222 });
      return realFetch(input, init);
    });
    writeDaemonState({ pid: 5252, port, startedAt: 222 });
    const state = await ensureDaemon('cli.js', { version: '0.11.0', spawnFn });
    expect(state.pid).toBe(5252);
    expect(spawnFn).not.toHaveBeenCalled();
  });
});
