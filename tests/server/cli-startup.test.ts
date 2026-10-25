import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../../');
const BIN = resolve(REPO_ROOT, 'bin/mdview.mjs');

// Packages that cost real start-up time and are only needed once a server or a
// browser is involved. `mdview --version`, `ls`, `rm` and `stop` must not pay.
const SERVER_ONLY_PACKAGES = [
  'fastify',
  '@fastify/static',
  'shiki',
  'markdown-it',
  'markdown-it-anchor',
  'markdown-it-task-lists',
  'js-yaml',
  'chokidar',
  'open',
];

function staticImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const m of source.matchAll(/^(?:import|\})[^\n]*?\bfrom\s+"([^"]+)"/gm)) specifiers.push(m[1]!);
  for (const m of source.matchAll(/^import\s+"([^"]+)"/gm)) specifiers.push(m[1]!);
  return specifiers;
}


describe('CLI start-up', () => {
  it('does not statically import server-only packages from the entry file', () => {
    const specifiers = staticImportSpecifiers(readFileSync(BIN, 'utf8'));
    expect(specifiers.length).toBeGreaterThan(0);
    for (const pkg of SERVER_ONLY_PACKAGES) {
      expect(specifiers, `entry statically imports ${pkg}`).not.toContain(pkg);
    }
  });

  it('keeps server-only packages out of every chunk the entry loads eagerly', () => {
    const entry = readFileSync(BIN, 'utf8');
    const eager = staticImportSpecifiers(entry).filter((s) => s.startsWith('./'));
    expect(eager.length).toBeGreaterThan(0);
    for (const rel of eager) {
      const chunk = readFileSync(resolve(REPO_ROOT, 'bin', rel), 'utf8');
      const specifiers = staticImportSpecifiers(chunk);
      for (const pkg of SERVER_ONLY_PACKAGES) {
        expect(specifiers, `${rel} statically imports ${pkg}`).not.toContain(pkg);
      }
    }
  });

  it('still runs from the split bundle', () => {
    const out = execFileSync(process.execPath, [BIN, '--version'], { encoding: 'utf8' }).trim();
    const { version } = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
    expect(out).toBe(version);
  });
});
