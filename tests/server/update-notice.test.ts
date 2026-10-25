import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stateDir, updateCheckPath } from '../../src/daemon/state.js';
import { createUpdateChecker } from '../../src/daemon/update-check.js';
import {
  DAY_MS,
  isCheckDue,
  readUpdateCache,
  recordCheck,
  recordNotified,
  wasRecentlyNotified,
} from '../../src/update/cache.js';
import { UpdateCheckError } from '../../src/update/latest.js';
import { printUpdateNotice } from '../../src/update/notice.js';

let home: string;
let previousXdg: string | undefined;

beforeEach(() => {
  previousXdg = process.env.XDG_CONFIG_HOME;
  home = mkdtempSync(path.join(tmpdir(), 'mdview-notice-'));
  process.env.XDG_CONFIG_HOME = home;
});

afterEach(() => {
  vi.useRealTimers();
  if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = previousXdg;
  rmSync(home, { recursive: true, force: true });
});

const T0 = 1_800_000_000_000;

describe('update cache', () => {
  it('lives beside the other state files', () => {
    expect(updateCheckPath()).toBe(path.join(stateDir(), 'update-check.json'));
  });

  it.skipIf(process.platform === 'win32')('is written 0600 in a 0700 dir', () => {
    recordCheck('0.12.0', T0);
    expect(statSync(updateCheckPath()).mode & 0o777).toBe(0o600);
    expect(statSync(stateDir()).mode & 0o777).toBe(0o700);
  });

  it.skipIf(process.platform === 'win32')('replaces a loose file with a private one', () => {
    mkdirSync(stateDir(), { recursive: true });
    writeFileSync(updateCheckPath(), '{}', { mode: 0o644 });
    chmodSync(updateCheckPath(), 0o644);
    recordCheck('0.12.0', T0);
    expect(statSync(updateCheckPath()).mode & 0o777).toBe(0o600);
  });

  it('round-trips and keeps only checkedAt and latest on a fresh write', () => {
    recordCheck('0.12.0', T0);
    expect(JSON.parse(readFileSync(updateCheckPath(), 'utf8'))).toEqual({ checkedAt: T0, latest: '0.12.0' });
    expect(readUpdateCache()).toEqual({ checkedAt: T0, latest: '0.12.0' });
  });

  it('keeps what the CLI already announced when the server records a new check', () => {
    recordCheck('0.12.0', T0);
    recordNotified('0.12.0', T0 + 5);
    recordCheck('0.12.0', T0 + DAY_MS);
    expect(readUpdateCache()).toEqual({
      checkedAt: T0 + DAY_MS,
      latest: '0.12.0',
      notifiedFor: '0.12.0',
      notifiedAt: T0 + 5,
    });
  });

  it('recordNotified patches only the notified fields and does nothing without a cache', () => {
    recordNotified('0.12.0', T0);
    expect(readUpdateCache()).toBeNull();
    recordCheck('0.13.0', T0);
    recordNotified('0.12.0', T0 + 1);
    expect(readUpdateCache()?.latest).toBe('0.13.0');
  });

  it('treats a missing, corrupt, or hostile file as absent', () => {
    expect(readUpdateCache()).toBeNull();
    mkdirSync(stateDir(), { recursive: true });
    for (const bad of [
      'not json',
      '[]',
      '{"checkedAt":1,"latest":"\\u001b[2J1.0.0"}',
      '{"checkedAt":"1","latest":"1.0.0"}',
      '{"checkedAt":-1,"latest":"1.0.0"}',
      '{"checkedAt":1,"latest":"latest"}',
      '{"latest":"1.0.0"}',
    ]) {
      writeFileSync(updateCheckPath(), bad);
      expect(readUpdateCache(), bad).toBeNull();
    }
  });

  it('drops a notified pair that does not validate but keeps the check', () => {
    mkdirSync(stateDir(), { recursive: true });
    writeFileSync(
      updateCheckPath(),
      JSON.stringify({ checkedAt: 5, latest: '1.0.0', notifiedFor: '\u001b[2J', notifiedAt: 6 }),
    );
    expect(readUpdateCache()).toEqual({ checkedAt: 5, latest: '1.0.0' });
  });

  it('is due after a day, or when dated in the future, and not before', () => {
    expect(isCheckDue(null, T0)).toBe(true);
    expect(isCheckDue({ checkedAt: T0, latest: '1.0.0' }, T0 + DAY_MS - 1)).toBe(false);
    expect(isCheckDue({ checkedAt: T0, latest: '1.0.0' }, T0 + DAY_MS)).toBe(true);
    expect(isCheckDue({ checkedAt: T0 + 1000, latest: '1.0.0' }, T0)).toBe(true);
  });

  it('throttles per version and per day', () => {
    const c = { checkedAt: T0, latest: '0.12.0', notifiedFor: '0.12.0', notifiedAt: T0 };
    expect(wasRecentlyNotified(c, T0 + DAY_MS - 1)).toBe(true);
    expect(wasRecentlyNotified(c, T0 + DAY_MS)).toBe(false);
    expect(wasRecentlyNotified({ ...c, latest: '0.13.0' }, T0 + 1)).toBe(false);
    expect(wasRecentlyNotified({ checkedAt: T0, latest: '0.12.0' }, T0 + 1)).toBe(false);
  });
});

describe('printUpdateNotice', () => {
  function run(over: Partial<Parameters<typeof printUpdateNotice>[0]> = {}) {
    const lines: string[] = [];
    const isEnabled = vi.fn(async () => true);
    return printUpdateNotice({
      version: '0.11.0',
      now: () => T0 + 10,
      interactive: () => true,
      isEnabled,
      print: (l) => lines.push(l),
      ...over,
    }).then(() => ({ lines, isEnabled }));
  }

  it('prints one line when a newer version is cached', async () => {
    recordCheck('0.12.0', T0);
    const { lines } = await run();
    expect(lines).toEqual(['mdview 0.12.0 is available — run `mdview update` for the install command.']);
  });

  it('prints once a day per version, then again after a day', async () => {
    recordCheck('0.12.0', T0);
    expect((await run()).lines).toHaveLength(1);
    expect((await run({ now: () => T0 + 1000 })).lines).toHaveLength(0);
    expect((await run({ now: () => T0 + 10 + DAY_MS })).lines).toHaveLength(1);
  });

  it('announces a newer version at once, even right after announcing an older one', async () => {
    recordCheck('0.12.0', T0);
    await run();
    recordCheck('0.13.0', T0 + 100);
    expect((await run({ now: () => T0 + 200 })).lines).toEqual([
      'mdview 0.13.0 is available — run `mdview update` for the install command.',
    ]);
  });

  it('stays quiet when disabled, not interactive, up to date, newer than the registry, or without a cache', async () => {
    recordCheck('0.12.0', T0);
    expect((await run({ isEnabled: async () => false })).lines).toEqual([]);
    expect((await run({ interactive: () => false })).lines).toEqual([]);
    expect((await run({ version: '0.12.0' })).lines).toEqual([]);
    expect((await run({ version: '0.13.0' })).lines).toEqual([]);
    expect((await run({ version: 'unknown' })).lines).toEqual([]);
    rmSync(updateCheckPath());
    expect((await run()).lines).toEqual([]);
  });

  it('does not even read config when not interactive', async () => {
    recordCheck('0.12.0', T0);
    const { isEnabled } = await run({ interactive: () => false });
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('never prints a version that fails validation', async () => {
    mkdirSync(stateDir(), { recursive: true });
    writeFileSync(updateCheckPath(), JSON.stringify({ checkedAt: T0, latest: '9.9.9\u001b]0;x\u0007' }));
    expect((await run()).lines).toEqual([]);
  });

  it('swallows failures', async () => {
    recordCheck('0.12.0', T0);
    const { lines } = await run({
      isEnabled: async () => {
        throw new Error('boom');
      },
    });
    expect(lines).toEqual([]);
  });
});

describe('update checker', () => {
  function make(over: Partial<Parameters<typeof createUpdateChecker>[0]> = {}) {
    const fetchLatest = vi.fn(async () => '0.12.0');
    const log = vi.fn();
    const checker = createUpdateChecker({
      isEnabled: async () => true,
      fetchLatest,
      now: () => T0,
      log,
      ...over,
    });
    return { checker, fetchLatest, log };
  }

  it('does nothing, and never fetches, while disabled', async () => {
    const { checker, fetchLatest } = make({ isEnabled: async () => false });
    expect(await checker.tick()).toBe('disabled');
    expect(fetchLatest).not.toHaveBeenCalled();
    expect(readUpdateCache()).toBeNull();
  });

  it('re-reads the setting on every tick', async () => {
    let enabled = false;
    const { checker, fetchLatest } = make({ isEnabled: async () => enabled });
    expect(await checker.tick()).toBe('disabled');
    enabled = true;
    expect(await checker.tick()).toBe('checked');
    expect(fetchLatest).toHaveBeenCalledTimes(1);
    enabled = false;
    expect(await checker.tick()).toBe('disabled');
  });

  it('fetches and records when due, then leaves a fresh cache alone', async () => {
    const { checker, fetchLatest } = make();
    expect(await checker.tick()).toBe('checked');
    expect(readUpdateCache()).toEqual({ checkedAt: T0, latest: '0.12.0' });
    expect(await checker.tick()).toBe('fresh');
    expect(fetchLatest).toHaveBeenCalledTimes(1);
  });

  it('checks again once the cache is a day old', async () => {
    let now = T0;
    const { checker, fetchLatest } = make({ now: () => now });
    await checker.tick();
    now = T0 + DAY_MS;
    expect(await checker.tick()).toBe('checked');
    expect(fetchLatest).toHaveBeenCalledTimes(2);
  });

  it('logs a failure, writes nothing, and keeps the earlier answer', async () => {
    recordCheck('0.11.5', T0 - DAY_MS - 1);
    const { checker, log } = make({
      fetchLatest: async () => {
        throw new UpdateCheckError('could not reach the registry');
      },
    });
    expect(await checker.tick()).toBe('failed');
    expect(log).toHaveBeenCalledWith('update check failed: could not reach the registry');
    expect(readUpdateCache()?.latest).toBe('0.11.5');
  });

  it('does not log the text of an unexpected error', async () => {
    const { checker, log } = make({
      fetchLatest: async () => {
        throw new Error('secret-ish detail');
      },
    });
    await checker.tick();
    expect(log).toHaveBeenCalledWith('update check failed: unexpected error');
  });

  it('does not overlap two checks', async () => {
    let release: (v: string) => void = () => undefined;
    const { checker, fetchLatest } = make({
      fetchLatest: () => new Promise<string>((r) => (release = r)),
    });
    const first = checker.tick();
    await new Promise((r) => setImmediate(r));
    expect(await checker.tick()).toBe('busy');
    release('0.12.0');
    expect(await first).toBe('checked');
    expect(fetchLatest).not.toHaveBeenCalledTimes(2);
  });

  it('checks at start and then on the poll interval, until stopped', async () => {
    vi.useFakeTimers();
    let now = T0;
    const fetchLatest = vi.fn(async () => '0.12.0');
    const checker = createUpdateChecker({
      isEnabled: async () => true,
      fetchLatest,
      now: () => now,
      log: () => undefined,
      pollMs: 1000,
    });
    checker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    now = T0 + DAY_MS;
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchLatest).toHaveBeenCalledTimes(2);

    checker.stop();
    now = T0 + 3 * DAY_MS;
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchLatest).toHaveBeenCalledTimes(2);
  });

  it('does not fetch at start when disabled, even across many polls', async () => {
    vi.useFakeTimers();
    const fetchLatest = vi.fn(async () => '0.12.0');
    const checker = createUpdateChecker({
      isEnabled: async () => false,
      fetchLatest,
      now: () => T0,
      log: () => undefined,
      pollMs: 1000,
    });
    checker.start();
    await vi.advanceTimersByTimeAsync(10_000);
    checker.stop();
    expect(fetchLatest).not.toHaveBeenCalled();
  });
});
