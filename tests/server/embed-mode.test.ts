import { type ChildProcess, execSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../../');
const BIN = resolve(REPO_ROOT, 'bin/mdview.mjs');
const FIXTURE_ROOT = resolve(REPO_ROOT, 'test-fixtures');

beforeAll(() => {
  // Build only the server entry to keep the test hermetic without paying for a full client build.
  execSync('npm run build:server', { cwd: REPO_ROOT, stdio: 'inherit' });
}, 60_000);

function spawnCli(args: string[]): Promise<{ child: ChildProcess; firstLine: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd: REPO_ROOT });
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
        resolved = true;
        resolveResult({ child, firstLine: stdoutBuf.slice(0, nl) });
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });
    child.on('error', finalize);
    // Surface non-zero exits with the real stderr so failures aren't silent timeouts.
    child.on('exit', (code) => {
      if (!resolved && code !== 0) {
        finalize(new Error(`mdview exited with code ${code}: ${stderrBuf.trim() || '(no stderr)'}`));
      }
    });
    setTimeout(() => finalize(new Error(`no stdout within 5s; stderr: ${stderrBuf.trim() || '(empty)'}`)), 5000);
  });
}

describe('--vscode embed mode: stdout', () => {
  it('emits a JSON ready line as the first stdout line', async () => {
    const { child, firstLine } = await spawnCli(['--vscode', '--port', '0', '--no-open', FIXTURE_ROOT]);
    try {
      const parsed = JSON.parse(firstLine);
      expect(parsed.event).toBe('ready');
      expect(typeof parsed.url).toBe('string');
      expect(parsed.url.startsWith('http://127.0.0.1:')).toBe(true);
      expect(Number.isInteger(parsed.port)).toBe(true);
      expect(parsed.port).toBeGreaterThan(0);
      // url should reflect port
      expect(parsed.url).toContain(String(parsed.port));
    } finally {
      child.kill();
    }
  });

  it('without --vscode emits legacy human-readable output, not JSON', async () => {
    const { child, firstLine } = await spawnCli(['--port', '0', '--no-open', FIXTURE_ROOT]);
    try {
      expect(firstLine.startsWith('mdview → ')).toBe(true);
      expect(() => JSON.parse(firstLine)).toThrow();
    } finally {
      child.kill();
    }
  });
});
