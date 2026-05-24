import { type ChildProcess, execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PALETTES } from '../../src/shared/types.js';

const REPO_ROOT = resolve(__dirname, '../../');
const BIN = resolve(REPO_ROOT, 'bin/mdview.mjs');

// Fresh temp fixture so the global/project config can't drift the assertions.
// XDG_CONFIG_HOME is also redirected per-test to isolate from the user's real
// ~/.config/mdview/config.json.
let fixtureRoot: string;
let xdgRoot: string;

beforeAll(() => {
  execSync('npm run build:server', { cwd: REPO_ROOT, stdio: 'inherit' });
  fixtureRoot = mkdtempSync(path.join(tmpdir(), 'mdview-palette-fixture-'));
  // A project config with palette=classic — the CLI override should beat it.
  writeFileSync(path.join(fixtureRoot, '.mdview.json'), JSON.stringify({ palette: 'classic' }));
  writeFileSync(path.join(fixtureRoot, 'doc.md'), '# Doc\n\nbody\n');
  xdgRoot = mkdtempSync(path.join(tmpdir(), 'mdview-palette-xdg-'));
}, 60_000);

afterAll(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  if (xdgRoot) rmSync(xdgRoot, { recursive: true, force: true });
});

interface Ready {
  child: ChildProcess;
  port: number;
  url: string;
}

// Why: --vscode emits a single-line JSON ready record, which gives us a
// deterministic port without parsing the human-readable URL line. The
// --palette behavior is independent of --vscode, so using it here only
// changes how we *discover* the bound port.
function spawnCliReady(args: string[]): Promise<Ready> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [BIN, '--vscode', '--no-open', '--port', '0', ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, XDG_CONFIG_HOME: xdgRoot },
    });
    let stdoutBuf = '';
    let stderrBuf = '';
    let resolved = false;
    const finalize = (err: Error) => {
      if (resolved) return;
      resolved = true;
      child.kill();
      reject(err);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const nl = stdoutBuf.indexOf('\n');
      if (nl >= 0 && !resolved) {
        const firstLine = stdoutBuf.slice(0, nl);
        try {
          const parsed = JSON.parse(firstLine);
          if (parsed.event === 'ready' && typeof parsed.url === 'string' && typeof parsed.port === 'number') {
            resolved = true;
            resolveResult({ child, port: parsed.port, url: parsed.url });
            return;
          }
        } catch {
          // not the line we want
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });
    child.on('error', finalize);
    child.on('exit', (code) => {
      if (!resolved && code !== 0) {
        finalize(new Error(`mdview exited with code ${code}: ${stderrBuf.trim() || '(no stderr)'}`));
      }
    });
    setTimeout(() => finalize(new Error(`no ready line within 5s; stderr: ${stderrBuf.trim() || '(empty)'}`)), 5000);
  });
}

interface ExitResult {
  code: number | null;
  stderr: string;
  stdout: string;
}

function spawnCliExpectExit(args: string[]): Promise<ExitResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [BIN, '--no-open', ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, XDG_CONFIG_HOME: xdgRoot },
    });
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;
    child.stdout.on('data', (chunk: Buffer) => { stdoutBuf += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });
    child.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        resolveResult({ code, stderr: stderrBuf, stdout: stdoutBuf });
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error(`did not exit within 5s; stderr: ${stderrBuf.trim() || '(empty)'}`));
      }
    }, 5000);
  });
}

describe('--palette flag', () => {
  it('overrides .mdview.json palette with nord', async () => {
    const { child, port } = await spawnCliReady(['--palette', 'nord', fixtureRoot]);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/tree`);
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { config: { palette?: string } | null };
      expect(body.config?.palette).toBe('nord');
    } finally {
      child.kill();
    }
  });

  it('overrides .mdview.json palette with paper', async () => {
    const { child, port } = await spawnCliReady(['--palette', 'paper', fixtureRoot]);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/tree`);
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { config: { palette?: string } | null };
      expect(body.config?.palette).toBe('paper');
    } finally {
      child.kill();
    }
  });

  it('rejects unknown palette values with a non-zero exit and helpful stderr', async () => {
    const result = await spawnCliExpectExit(['--palette', 'banana', fixtureRoot]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/banana/);
    // Lists at least one valid palette so the user can recover.
    expect(result.stderr).toMatch(/classic|paper|nord|solarized|high-contrast/);
  });

  it('without --palette, returns whatever the loaded config has (a real palette)', async () => {
    const { child, port } = await spawnCliReady([fixtureRoot]);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/tree`);
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { config: { palette?: string } | null };
      // .mdview.json supplies palette=classic in the fixture. Don't pin to a
      // specific value — just confirm the override hasn't leaked.
      const p = body.config?.palette;
      expect(p).toBeDefined();
      expect((PALETTES as readonly string[]).includes(p as string)).toBe(true);
      expect(p).not.toBe('banana');
    } finally {
      child.kill();
    }
  });
});
