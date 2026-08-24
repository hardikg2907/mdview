import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { idleTimeoutMs } from '../../src/cli.js';
import { findLiveDaemon } from '../../src/daemon/client.js';
import {
  daemonLockPath,
  daemonStatePath,
  readDaemonState,
  readJsonSafe,
  releaseSpawnLock,
  stateDir,
  tryTakeSpawnLock,
  workspaceFilePath,
  writeDaemonState,
  writeJsonAtomic,
} from '../../src/daemon/state.js';
import {
  addRoot,
  MAX_ROOTS,
  readWorkspace,
  removeRoot,
  writeWorkspace,
} from '../../src/daemon/workspace-file.js';

let home: string;
let previousXdg: string | undefined;

beforeEach(() => {
  // Every path in src/daemon is derived from globalConfigPath(), which reads
  // XDG_CONFIG_HOME at call time — so pointing it at a temp dir isolates the
  // whole module from the real one.
  previousXdg = process.env.XDG_CONFIG_HOME;
  home = mkdtempSync(path.join(tmpdir(), 'mdview-state-'));
  process.env.XDG_CONFIG_HOME = home;
});

afterEach(() => {
  if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = previousXdg;
  rmSync(home, { recursive: true, force: true });
});

describe('state files', () => {
  it('writes the state dir 0700 and files 0600', () => {
    writeDaemonState({ pid: 111, port: 7331, startedAt: 5 });
    // Mask off the file-type bits; only permissions matter here.
    expect(statSync(stateDir()).mode & 0o777).toBe(0o700);
    expect(statSync(daemonStatePath()).mode & 0o777).toBe(0o600);
  });

  it('round-trips daemon state', () => {
    writeDaemonState({ pid: 4242, port: 7412, startedAt: 1234 });
    expect(readDaemonState()).toEqual({ pid: 4242, port: 7412, startedAt: 1234 });
  });

  it('leaves no temp file behind, so a reader never sees a partial write', () => {
    writeJsonAtomic(path.join(home, 'mdview', 'x.json'), { a: 1 });
    const entries = readFileSync(path.join(home, 'mdview', 'x.json'), 'utf8');
    expect(JSON.parse(entries)).toEqual({ a: 1 });
    // The temp name is derived from the pid; nothing matching it should remain.
    const dir = path.join(home, 'mdview');
    const leftovers = readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('treats a corrupt or missing file as absent rather than throwing', () => {
    expect(readJsonSafe(path.join(home, 'nope.json'))).toBeNull();
    expect(readDaemonState()).toBeNull();
    mkdirSync(path.join(home, 'mdview'), { recursive: true });
    writeFileSync(daemonStatePath(), '{"pid": 12, tru');
    expect(readDaemonState()).toBeNull();
  });

  it('rejects state that is present but not usable', () => {
    mkdirSync(path.join(home, 'mdview'), { recursive: true });
    for (const bad of [
      { pid: 0, port: 7331, startedAt: 1 },
      { pid: -5, port: 7331, startedAt: 1 },
      { pid: 12, port: 99999, startedAt: 1 },
      { pid: 12, port: 7331 },
      { pid: '12', port: 7331, startedAt: 1 },
      [1, 2, 3],
    ]) {
      writeFileSync(daemonStatePath(), JSON.stringify(bad));
      expect(readDaemonState(), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('spawn lock', () => {
  it('is held by one caller at a time', () => {
    expect(tryTakeSpawnLock()).toBe(true);
    expect(tryTakeSpawnLock()).toBe(false);
    releaseSpawnLock();
    expect(tryTakeSpawnLock()).toBe(true);
  });

  it('ages out a lock left behind by a process that died mid-spawn', () => {
    expect(tryTakeSpawnLock()).toBe(true);
    // Backdate it rather than passing a zero window: filesystem timestamps have
    // finer resolution than Date.now(), so a just-created lock can compute a
    // slightly negative age and read as fresh.
    const old = new Date(Date.now() - 60_000);
    utimesSync(daemonLockPath(), old, old);
    // A lock older than the window is up for grabs — otherwise one crash mid
    // spawn would wedge every later run.
    expect(tryTakeSpawnLock(10_000)).toBe(true);
  });

  it('leaves a fresh lock alone', () => {
    expect(tryTakeSpawnLock()).toBe(true);
    expect(tryTakeSpawnLock(60_000)).toBe(false);
  });
});

describe('workspace file', () => {
  let repoA: string;
  let repoB: string;

  beforeEach(() => {
    repoA = mkdtempSync(path.join(tmpdir(), 'mdview-wsA-'));
    repoB = mkdtempSync(path.join(tmpdir(), 'mdview-wsB-'));
    mkdirSync(path.join(repoA, 'docs'));
    writeFileSync(path.join(repoA, 'docs', 'guide.md'), '# Guide\n');
    writeFileSync(path.join(repoB, 'NOTES.md'), '# Notes\n');
  });

  afterEach(() => {
    rmSync(repoA, { recursive: true, force: true });
    rmSync(repoB, { recursive: true, force: true });
  });

  it('adds a folder and reports it as new', () => {
    const res = addRoot(repoA);
    expect(res.changed).toBe(true);
    expect(res.focusPath).toBe(res.root.id);
    expect(res.filePath).toBe('');
    expect(readWorkspace().roots.map((r) => r.path)).toEqual([repoA]);
  });

  it('reuses the covering root for a file inside it instead of adding a second', () => {
    const first = addRoot(repoA);
    const nested = addRoot(path.join(repoA, 'docs', 'guide.md'));
    expect(nested.changed).toBe(false);
    expect(nested.root.id).toBe(first.root.id);
    expect(nested.filePath).toBe(`${first.root.id}/docs/guide.md`);
    expect(readWorkspace().roots).toHaveLength(1);
  });

  it('reuses the covering root for a subfolder, focusing it', () => {
    const first = addRoot(repoA);
    const sub = addRoot(path.join(repoA, 'docs'));
    expect(sub.changed).toBe(false);
    expect(sub.focusPath).toBe(`${first.root.id}/docs`);
    expect(readWorkspace().roots).toHaveLength(1);
  });

  it('does not treat a sibling with a shared name prefix as covered', () => {
    // `<repoA>` must not appear to contain `<repoA>-other`.
    const sibling = `${repoA}-other`;
    mkdirSync(sibling);
    try {
      addRoot(repoA);
      const res = addRoot(sibling);
      expect(res.changed).toBe(true);
      expect(readWorkspace().roots).toHaveLength(2);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('adds a genuinely separate folder alongside', () => {
    addRoot(repoA);
    addRoot(repoB);
    expect(readWorkspace().roots).toHaveLength(2);
  });

  it('records a single-file target as a file root', () => {
    const res = addRoot(path.join(repoB, 'NOTES.md'));
    const [rec] = readWorkspace().roots;
    expect(rec).toMatchObject({ path: repoB, kind: 'file', filePath: 'NOTES.md' });
    expect(res.filePath).toBe(`${rec?.id}/NOTES.md`);
  });

  it('refuses a path that does not exist', () => {
    expect(() => addRoot(path.join(repoA, 'ghost'))).toThrow(/does not exist/i);
  });

  it('refuses to grow past the cap', () => {
    const dirs: string[] = [];
    for (let i = 0; i < MAX_ROOTS; i++) {
      const d = mkdtempSync(path.join(tmpdir(), `mdview-cap${i}-`));
      dirs.push(d);
      addRoot(d);
    }
    const extra = mkdtempSync(path.join(tmpdir(), 'mdview-cap-extra-'));
    try {
      expect(() => addRoot(extra)).toThrow(/full/i);
    } finally {
      for (const d of [...dirs, extra]) rmSync(d, { recursive: true, force: true });
    }
  });

  it('removes by id and by path, and reports a miss', () => {
    const a = addRoot(repoA);
    addRoot(repoB);
    expect(removeRoot(a.root.id)?.path).toBe(repoA);
    expect(removeRoot(repoB)?.path).toBe(repoB);
    expect(removeRoot('ghost')).toBeNull();
    expect(readWorkspace().roots).toEqual([]);
  });

  it('drops entries that do not validate rather than failing the whole file', () => {
    mkdirSync(path.join(home, 'mdview'), { recursive: true });
    writeFileSync(
      workspaceFilePath(),
      JSON.stringify({
        roots: [
          { id: 'good', path: repoA, kind: 'dir' },
          { id: '../evil', path: repoA, kind: 'dir' },
          { id: 'relative', path: 'not/absolute', kind: 'dir' },
          { id: 'badkind', path: repoB, kind: 'symlink' },
          { id: 'sepinfile', path: repoB, kind: 'file', filePath: '../../etc/passwd' },
          { id: 'nofile', path: repoB, kind: 'file' },
          'not-an-object',
        ],
      }),
    );
    expect(readWorkspace().roots.map((r) => r.id)).toEqual(['good']);
  });

  it('keeps the first of duplicate ids and caps the list', () => {
    const many = Array.from({ length: MAX_ROOTS + 4 }, (_, i) => ({
      id: `r${i}`,
      path: repoA,
      kind: 'dir' as const,
    }));
    writeWorkspace({ roots: [...many, { id: 'r0', path: repoB, kind: 'dir' }] });
    const read = readWorkspace();
    expect(read.roots).toHaveLength(MAX_ROOTS);
    expect(read.roots[0]?.path).toBe(repoA);
  });

  it('treats a missing file as an empty workspace', () => {
    expect(readWorkspace()).toEqual({ roots: [] });
  });
});

describe('findLiveDaemon identity check', () => {
  let app: FastifyInstance;
  let port: number;
  let reported: { pid: number; startedAt: number };

  beforeEach(async () => {
    reported = { pid: 4242, startedAt: 999 };
    app = Fastify({ logger: false });
    app.get('/api/health', async (_req, reply) =>
      reply.send({ ok: true, ...reported, roots: ['alpha'] }),
    );
    await app.listen({ host: '127.0.0.1', port: 0 });
    const addr = app.server.address();
    port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts a daemon whose pid and start time both match the record', async () => {
    writeDaemonState({ pid: 4242, port, startedAt: 999 });
    const live = await findLiveDaemon();
    expect(live?.health.roots).toEqual(['alpha']);
  });

  it('rejects a recycled pid: same pid, different start time', async () => {
    // The dangerous case — the record's pid is alive, but it is somebody else.
    writeDaemonState({ pid: 4242, port, startedAt: 111 });
    expect(await findLiveDaemon()).toBeNull();
  });

  it('rejects a different process answering on our port', async () => {
    writeDaemonState({ pid: 5555, port, startedAt: 999 });
    expect(await findLiveDaemon()).toBeNull();
  });

  it('rejects a port with nothing listening', async () => {
    await app.close();
    writeDaemonState({ pid: 4242, port, startedAt: 999 });
    expect(await findLiveDaemon()).toBeNull();
  });
});

describe('idleTimeoutMs', () => {
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.MDVIEW_IDLE_TIMEOUT;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.MDVIEW_IDLE_TIMEOUT;
    else process.env.MDVIEW_IDLE_TIMEOUT = previous;
  });

  it('is off unless asked for, so the server runs until `mdview stop`', () => {
    delete process.env.MDVIEW_IDLE_TIMEOUT;
    expect(idleTimeoutMs()).toBe(0);
  });

  it('reads minutes, including fractions', () => {
    process.env.MDVIEW_IDLE_TIMEOUT = '10';
    expect(idleTimeoutMs()).toBe(600_000);
    process.env.MDVIEW_IDLE_TIMEOUT = '0.5';
    expect(idleTimeoutMs()).toBe(30_000);
  });

  it('treats an explicit 0 as off', () => {
    process.env.MDVIEW_IDLE_TIMEOUT = '0';
    expect(idleTimeoutMs()).toBe(0);
  });

  it('falls back to off on junk rather than failing to start', () => {
    for (const bad of ['nonsense', '-5', '', 'NaN', 'Infinity']) {
      process.env.MDVIEW_IDLE_TIMEOUT = bad;
      expect(idleTimeoutMs(), JSON.stringify(bad)).toBe(0);
    }
  });
});
