import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runConfigSubcommand } from '../../src/cli-config.js';
import { globalConfigPath } from '../../src/server/config.js';

let home: string;
let previousXdg: string | undefined;
let out: string[];
let err: string[];

beforeEach(() => {
  previousXdg = process.env.XDG_CONFIG_HOME;
  home = mkdtempSync(path.join(tmpdir(), 'mdview-cfgcli-'));
  process.env.XDG_CONFIG_HOME = home;
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a) => void err.push(a.join(' ')));
});

afterEach(() => {
  vi.restoreAllMocks();
  if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = previousXdg;
  rmSync(home, { recursive: true, force: true });
});

describe('mdview config update-check', () => {
  it('is off until turned on, and reports its state', async () => {
    expect(await runConfigSubcommand(['update-check'])).toBe(0);
    expect(out).toEqual(['update-check: off']);
  });

  it('turns on and off in the global config', async () => {
    expect(await runConfigSubcommand(['update-check', 'on'])).toBe(0);
    expect(JSON.parse(readFileSync(globalConfigPath(), 'utf8'))).toEqual({ updateCheck: true });
    out.length = 0;
    expect(await runConfigSubcommand(['update-check'])).toBe(0);
    expect(out).toEqual(['update-check: on']);

    expect(await runConfigSubcommand(['update-check', 'off'])).toBe(0);
    expect(JSON.parse(readFileSync(globalConfigPath(), 'utf8'))).toEqual({});
  });

  it('rejects anything but on or off', async () => {
    for (const argv of [['update-check', 'maybe'], ['update-check', 'on', 'off'], ['update-check', 'true']]) {
      expect(await runConfigSubcommand(argv), argv.join(' ')).toBe(2);
    }
    expect(err.length).toBeGreaterThan(0);
  });
});
