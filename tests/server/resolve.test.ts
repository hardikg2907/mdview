import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutsideRootError, resolveSafePath } from '../../src/server/fs/resolve.js';

const isWin = process.platform === 'win32';

describe('resolveSafePath', () => {
  let base: string;
  let root: string;
  let realRoot: string;

  beforeAll(() => {
    // os.tmpdir() is itself behind a link on macOS (/var -> /private/var), so
    // the lexical root and the real root differ — exactly the case under test.
    base = mkdtempSync(path.join(tmpdir(), 'mdview-resolve-'));
    root = path.join(base, 'root');
    mkdirSync(path.join(root, 'docs'), { recursive: true });
    mkdirSync(path.join(base, 'outside'));
    writeFileSync(path.join(root, 'docs', 'intro.md'), '# hi');
    writeFileSync(path.join(base, 'outside', 'secret'), 'TOP-SECRET');
    realRoot = realpathSync(root);
    if (!isWin) {
      symlinkSync('../outside/secret', path.join(root, 'leak.md'));
      symlinkSync(path.join(base, 'outside'), path.join(root, 'outdir'));
      symlinkSync('docs/intro.md', path.join(root, 'alias.md'));
      symlinkSync('nowhere.md', path.join(root, 'dangling.md'));
    }
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('resolves a relative path inside root to its real path', async () => {
    expect(await resolveSafePath(root, 'docs/intro.md')).toBe(
      path.join(realRoot, 'docs', 'intro.md'),
    );
  });

  it('rejects paths that escape root via ..', async () => {
    await expect(resolveSafePath(root, '../../etc/passwd')).rejects.toThrow(OutsideRootError);
    await expect(resolveSafePath(root, '../outside/secret')).rejects.toThrow(/outside root/);
  });

  it('rejects absolute paths', async () => {
    await expect(resolveSafePath(root, '/etc/passwd')).rejects.toThrow(/absolute/);
  });

  it('treats empty as root', async () => {
    expect(await resolveSafePath(root, '')).toBe(realRoot);
  });

  it('normalizes redundant segments', async () => {
    expect(await resolveSafePath(root, './docs/./intro.md')).toBe(
      path.join(realRoot, 'docs', 'intro.md'),
    );
  });

  it('accepts a sibling whose name merely starts with two dots', async () => {
    writeFileSync(path.join(root, '..notes.md'), 'x');
    expect(await resolveSafePath(root, '..notes.md')).toBe(path.join(realRoot, '..notes.md'));
  });

  it('surfaces ENOENT for a missing file rather than an escape', async () => {
    await expect(resolveSafePath(root, 'docs/missing.md')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('accepts the precomputed real root', async () => {
    expect(await resolveSafePath(root, 'docs/intro.md', { realRoot })).toBe(
      path.join(realRoot, 'docs', 'intro.md'),
    );
  });

  describe.skipIf(isWin)('symlinks', () => {
    it('refuses a file link that points outside the root', async () => {
      await expect(resolveSafePath(root, 'leak.md')).rejects.toThrow(OutsideRootError);
    });

    it('refuses a path through a directory link that points outside', async () => {
      await expect(resolveSafePath(root, 'outdir/secret')).rejects.toThrow(OutsideRootError);
    });

    it('follows a link that stays inside the root', async () => {
      expect(await resolveSafePath(root, 'alias.md')).toBe(
        path.join(realRoot, 'docs', 'intro.md'),
      );
    });

    it('treats a dangling link as missing', async () => {
      await expect(resolveSafePath(root, 'dangling.md')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });

    it('works when the root itself is reached through a link', async () => {
      const linkedRoot = path.join(base, 'linked-root');
      symlinkSync(root, linkedRoot);
      expect(await resolveSafePath(linkedRoot, 'docs/intro.md')).toBe(
        path.join(realRoot, 'docs', 'intro.md'),
      );
      await expect(resolveSafePath(linkedRoot, 'leak.md')).rejects.toThrow(OutsideRootError);
    });

    it('works for a root under /tmp', async () => {
      const tmpRoot = mkdtempSync('/tmp/mdview-resolve-');
      try {
        writeFileSync(path.join(tmpRoot, 'a.md'), '# a');
        symlinkSync(path.join(base, 'outside', 'secret'), path.join(tmpRoot, 'b.md'));
        expect(await resolveSafePath(tmpRoot, 'a.md')).toBe(
          path.join(realpathSync(tmpRoot), 'a.md'),
        );
        await expect(resolveSafePath(tmpRoot, 'b.md')).rejects.toThrow(OutsideRootError);
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });
});
