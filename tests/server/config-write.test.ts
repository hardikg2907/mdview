import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addIgnoreEntries,
  isValidIgnoreEntry,
  listUserIgnoreEntries,
  readUpdateCheck,
  removeIgnoreEntries,
  setUpdateCheck,
} from '../../src/server/config-write.js';

let dir: string;
let cfgPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mdview-cfgwrite-'));
  cfgPath = path.join(dir, 'config.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('isValidIgnoreEntry', () => {
  it('accepts plain basenames', () => {
    expect(isValidIgnoreEntry('deps')).toBe(true);
    expect(isValidIgnoreEntry('_build')).toBe(true);
    expect(isValidIgnoreEntry('my-dir')).toBe(true);
    expect(isValidIgnoreEntry('a.b.c')).toBe(true);
  });
  it('rejects traversal, separators, globs, whitespace', () => {
    expect(isValidIgnoreEntry('.')).toBe(false);
    expect(isValidIgnoreEntry('..')).toBe(false);
    expect(isValidIgnoreEntry('foo/bar')).toBe(false);
    expect(isValidIgnoreEntry('foo\\bar')).toBe(false);
    expect(isValidIgnoreEntry('*.tmp')).toBe(false);
    expect(isValidIgnoreEntry('has space')).toBe(false);
    expect(isValidIgnoreEntry('')).toBe(false);
    expect(isValidIgnoreEntry('a'.repeat(65))).toBe(false);
  });
});

describe('addIgnoreEntries', () => {
  it('creates the config file when it does not exist', async () => {
    expect(existsSync(cfgPath)).toBe(false);
    const result = await addIgnoreEntries(['deps'], cfgPath);
    expect(result.before).toEqual([]);
    expect(result.after).toEqual(['deps']);
    const written = JSON.parse(readFileSync(cfgPath, 'utf8'));
    expect(written).toEqual({ ignore: ['deps'] });
  });

  it('appends to an existing ignore array, dedupes, sorts', async () => {
    writeFileSync(cfgPath, JSON.stringify({ palette: 'kanagawa', ignore: ['c', 'a'] }));
    const result = await addIgnoreEntries(['b', 'a', 'd'], cfgPath);
    expect(result.after).toEqual(['a', 'b', 'c', 'd']);
    const written = JSON.parse(readFileSync(cfgPath, 'utf8'));
    expect(written).toEqual({ palette: 'kanagawa', ignore: ['a', 'b', 'c', 'd'] });
  });

  it('preserves unknown top-level fields', async () => {
    writeFileSync(cfgPath, JSON.stringify({ palette: 'kanagawa', mystery: { x: 1 } }));
    await addIgnoreEntries(['deps'], cfgPath);
    const written = JSON.parse(readFileSync(cfgPath, 'utf8'));
    expect(written.palette).toBe('kanagawa');
    expect(written.mystery).toEqual({ x: 1 });
  });

  it('rejects invalid entries before touching the file', async () => {
    writeFileSync(cfgPath, JSON.stringify({ ignore: ['existing'] }));
    await expect(addIgnoreEntries(['ok', '../escape'], cfgPath)).rejects.toThrow(/Invalid ignore entry/);
    // File untouched
    expect(JSON.parse(readFileSync(cfgPath, 'utf8'))).toEqual({ ignore: ['existing'] });
  });

  it('refuses to overwrite an existing non-object config', async () => {
    writeFileSync(cfgPath, JSON.stringify(['not', 'an', 'object']));
    await expect(addIgnoreEntries(['deps'], cfgPath)).rejects.toThrow(/not a JSON object/);
  });

  it('refuses to overwrite invalid JSON', async () => {
    writeFileSync(cfgPath, '{not json');
    await expect(addIgnoreEntries(['deps'], cfgPath)).rejects.toThrow(/not valid JSON/);
  });
});

describe('removeIgnoreEntries', () => {
  it('removes the listed names and drops the field when empty', async () => {
    writeFileSync(cfgPath, JSON.stringify({ palette: 'kanagawa', ignore: ['a', 'b'] }));
    const result = await removeIgnoreEntries(['a', 'b'], cfgPath);
    expect(result.after).toEqual([]);
    const written = JSON.parse(readFileSync(cfgPath, 'utf8'));
    expect(written).toEqual({ palette: 'kanagawa' });
    expect('ignore' in written).toBe(false);
  });

  it('silently no-ops on names that are not present', async () => {
    writeFileSync(cfgPath, JSON.stringify({ ignore: ['a'] }));
    const result = await removeIgnoreEntries(['x'], cfgPath);
    expect(result.before).toEqual(['a']);
    expect(result.after).toEqual(['a']);
  });
});

describe('listUserIgnoreEntries', () => {
  it('returns empty when file is missing', async () => {
    expect(await listUserIgnoreEntries(cfgPath)).toEqual([]);
  });

  it('returns only string entries', async () => {
    writeFileSync(cfgPath, JSON.stringify({ ignore: ['a', 1, null, 'b'] }));
    expect(await listUserIgnoreEntries(cfgPath)).toEqual(['a', 'b']);
  });
});

describe.skipIf(process.platform === 'win32')('config file modes', () => {
  it('creates the directory 0700 and config.json 0600', async () => {
    const nested = path.join(dir, 'mdview', 'config.json');
    await addIgnoreEntries(['deps'], nested);
    expect(statSync(path.dirname(nested)).mode & 0o777).toBe(0o700);
    expect(statSync(nested).mode & 0o777).toBe(0o600);
  });

  it('tightens a directory and file an older version left world-readable', async () => {
    chmodSync(dir, 0o755);
    writeFileSync(cfgPath, '{}\n', { mode: 0o644 });
    chmodSync(cfgPath, 0o644);
    await addIgnoreEntries(['deps'], cfgPath);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(cfgPath).mode & 0o777).toBe(0o600);
  });
});

describe('update-check setting', () => {
  it('is off when the file or key is missing', async () => {
    expect(await readUpdateCheck(cfgPath)).toBe(false);
    writeFileSync(cfgPath, '{"palette":"kanagawa"}');
    expect(await readUpdateCheck(cfgPath)).toBe(false);
  });

  it('turns on and off, keeping the other keys, with a 0600 file', async () => {
    writeFileSync(cfgPath, JSON.stringify({ palette: 'kanagawa', ignore: ['deps'] }));
    expect(await setUpdateCheck(true, cfgPath)).toEqual({ before: false, after: true, path: cfgPath });
    expect(JSON.parse(readFileSync(cfgPath, 'utf8'))).toEqual({
      palette: 'kanagawa',
      ignore: ['deps'],
      updateCheck: true,
    });
    if (process.platform !== 'win32') expect(statSync(cfgPath).mode & 0o777).toBe(0o600);
    expect(await readUpdateCheck(cfgPath)).toBe(true);

    expect(await setUpdateCheck(false, cfgPath)).toEqual({ before: true, after: false, path: cfgPath });
    expect(JSON.parse(readFileSync(cfgPath, 'utf8'))).toEqual({
      palette: 'kanagawa',
      ignore: ['deps'],
    });
  });

  it('creates the file when there is none', async () => {
    await setUpdateCheck(true, cfgPath);
    expect(JSON.parse(readFileSync(cfgPath, 'utf8'))).toEqual({ updateCheck: true });
  });

  it('refuses to overwrite a config that is not JSON', async () => {
    writeFileSync(cfgPath, 'not json');
    await expect(setUpdateCheck(true, cfgPath)).rejects.toThrow(/not valid JSON/);
    expect(readFileSync(cfgPath, 'utf8')).toBe('not json');
  });
});
