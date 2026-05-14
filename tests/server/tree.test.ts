import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { walkFolder } from '../../src/server/fs/tree.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'mdview-tree-'));
  mkdirSync(path.join(root, 'guides'));
  writeFileSync(path.join(root, 'README.md'), '# r');
  writeFileSync(path.join(root, 'image.png'), '');
  writeFileSync(path.join(root, 'guides', 'intro.md'), '# i');
  writeFileSync(path.join(root, 'guides', 'advanced.markdown'), '# a');
  mkdirSync(path.join(root, '.git'));
  writeFileSync(path.join(root, '.git', 'HEAD'), 'ref');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('walkFolder', () => {
  it('lists md files and recurses into directories', async () => {
    const tree = await walkFolder(root);
    expect(tree.length).toBeGreaterThan(0);

    const names = tree.map((n) => n.name).sort();
    expect(names).toContain('README.md');
    expect(names).toContain('image.png');
    expect(names).toContain('guides');

    const guides = tree.find((n) => n.name === 'guides')!;
    expect(guides.type).toBe('dir');
    expect(guides.children!.map((n) => n.name).sort()).toEqual(['advanced.markdown', 'intro.md']);
    expect(guides.children!.every((n) => n.isMarkdown)).toBe(true);
  });

  it('marks non-md files with isMarkdown: false', async () => {
    const tree = await walkFolder(root);
    const png = tree.find((n) => n.name === 'image.png')!;
    expect(png.type).toBe('file');
    expect(png.isMarkdown).toBe(false);
  });

  it('skips dot-directories like .git', async () => {
    const tree = await walkFolder(root);
    expect(tree.find((n) => n.name === '.git')).toBeUndefined();
  });

  it('skips built-in heavy dirs (node_modules, _build, dist, …) at every depth', async () => {
    mkdirSync(path.join(root, 'node_modules', 'foo'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules', 'foo', 'index.js'), '');
    mkdirSync(path.join(root, '_build', 'dev'), { recursive: true });
    writeFileSync(path.join(root, '_build', 'dev', 'app.beam'), '');
    mkdirSync(path.join(root, 'guides', 'dist'), { recursive: true });
    writeFileSync(path.join(root, 'guides', 'dist', 'leak.md'), '# l');

    const tree = await walkFolder(root);
    expect(tree.find((n) => n.name === 'node_modules')).toBeUndefined();
    expect(tree.find((n) => n.name === '_build')).toBeUndefined();
    const guides = tree.find((n) => n.name === 'guides')!;
    expect(guides.children!.find((n) => n.name === 'dist')).toBeUndefined();
  });

  it('respects a custom ignore set instead of the defaults', async () => {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules', 'a.md'), '# a');
    mkdirSync(path.join(root, 'custom-bulk'), { recursive: true });
    writeFileSync(path.join(root, 'custom-bulk', 'b.md'), '# b');

    const tree = await walkFolder(root, { ignore: new Set(['custom-bulk']) });
    // Defaults are NOT applied when a custom set is passed — so node_modules
    // shows up but custom-bulk is skipped.
    expect(tree.find((n) => n.name === 'node_modules')).toBeDefined();
    expect(tree.find((n) => n.name === 'custom-bulk')).toBeUndefined();
  });

  it('returns relPath using forward slashes', async () => {
    const tree = await walkFolder(root);
    const intro = tree
      .find((n) => n.name === 'guides')!
      .children!.find((n) => n.name === 'intro.md')!;
    expect(intro.relPath).toBe('guides/intro.md');
  });
});
