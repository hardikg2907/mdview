import { type ChildProcess, execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/cli.js';
import { createServer } from '../../src/server/index.js';

const REPO_ROOT = resolve(__dirname, '../../');
const BIN = resolve(REPO_ROOT, 'bin/mdview.mjs');
const FIXTURE_ROOT = resolve(REPO_ROOT, 'test-fixtures');
// dist/client is built by the beforeAll below so CSP inject tests
// (sendFile('index.html')) work on a fresh checkout.
const CLIENT_DIR = resolve(REPO_ROOT, 'dist/client');

beforeAll(() => {
  // Full build: server bin for the spawn-based stdout tests, client bundle for
  // the inject-based CSP tests (sendFile('index.html') needs dist/client to exist).
  execSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit' });
}, 120_000);

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

describe('--vscode implies --no-open', () => {
  it('parseArgs([--vscode, ./]) sets open === false', () => {
    const result = parseArgs(['--vscode', './']);
    if (result.kind !== 'run') throw new Error('expected run');
    expect(result.args.open).toBe(false);
  });

  it('parseArgs([./]) sets open === true (default)', () => {
    const result = parseArgs(['./']);
    if (result.kind !== 'run') throw new Error('expected run');
    expect(result.args.open).toBe(true);
  });

  it('parseArgs([--no-open, ./]) sets open === false', () => {
    const result = parseArgs(['--no-open', './']);
    if (result.kind !== 'run') throw new Error('expected run');
    expect(result.args.open).toBe(false);
  });

  it('parseArgs([--vscode, --no-open, ./]) sets open === false (idempotent)', () => {
    const result = parseArgs(['--vscode', '--no-open', './']);
    if (result.kind !== 'run') throw new Error('expected run');
    expect(result.args.open).toBe(false);
  });
});

describe('--vscode embed mode: stdout', () => {
  it('emits a JSON ready line as the first stdout line (no --no-open needed)', async () => {
    const { child, firstLine } = await spawnCli(['--vscode', '--port', '0', FIXTURE_ROOT]);
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

describe('--vscode: stdin EOF shutdown', () => {
  it('closes cleanly when stdin pipe is closed (exit code 0 within 3s)', async () => {
    const { child } = await spawnCli(['--vscode', '--port', '0', FIXTURE_ROOT]);
    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('CLI did not exit within 3s after stdin.end()')),
          3000,
        );
        child.on('exit', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
        child.stdin!.end();
      });
      expect(exitCode).toBe(0);
    } finally {
      // Safety: kill if the promise somehow resolved but the child is still running.
      try { child.kill(); } catch { /* already gone */ }
    }
  });
});

// The directives that must be byte-for-byte identical in both branches.
// Only frame-ancestors is allowed to differ between embed and non-embed mode.
const SHARED_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
] as const;

describe('--vscode embed mode: CSP', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), 'mdview-csp-'));
    writeFileSync(path.join(tmpRoot, 'README.md'), '# Test\n');
  });

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('embed mode: frame-ancestors is omitted entirely', async () => {
    // Chromium 142 (VS Code 1.126) narrowed `frame-ancestors *` to network
    // schemes only, which excludes the webview's vscode-webview: parent. No
    // value can name the dynamic origin, so embed mode drops the directive.
    const app = await createServer({
      roots: [{ absPath: tmpRoot, kind: 'dir' }],
      clientDir: CLIENT_DIR,
      embedMode: true,
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      const csp = res.headers['content-security-policy'] as string;
      expect(csp).not.toContain('frame-ancestors');
    } finally {
      await app.close();
    }
  });

  it('default (no embed): frame-ancestors is "none" (not *)', async () => {
    const app = await createServer({
      roots: [{ absPath: tmpRoot, kind: 'dir' }],
      clientDir: CLIENT_DIR,
      embedMode: false,
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      const csp = res.headers['content-security-policy'] as string;
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("frame-ancestors *");
    } finally {
      await app.close();
    }
  });

  it('regression: all non-frame-ancestors directives are identical in both modes', async () => {
    const embedApp = await createServer({
      roots: [{ absPath: tmpRoot, kind: 'dir' }],
      clientDir: CLIENT_DIR,
      embedMode: true,
    });
    const defaultApp = await createServer({
      roots: [{ absPath: tmpRoot, kind: 'dir' }],
      clientDir: CLIENT_DIR,
      embedMode: false,
    });
    try {
      const embedRes = await embedApp.inject({ method: 'GET', url: '/' });
      const defaultRes = await defaultApp.inject({ method: 'GET', url: '/' });
      const embedCsp = embedRes.headers['content-security-policy'] as string;
      const defaultCsp = defaultRes.headers['content-security-policy'] as string;

      // Verify that every shared directive is present in both CSP strings.
      for (const directive of SHARED_DIRECTIVES) {
        expect(embedCsp, `embed CSP missing: ${directive}`).toContain(directive);
        expect(defaultCsp, `default CSP missing: ${directive}`).toContain(directive);
      }

      // The only difference between the two must be in frame-ancestors.
      const normalise = (csp: string) =>
        csp
          .split(';')
          .map((d) => d.trim())
          .filter((d) => !d.startsWith('frame-ancestors'))
          .sort()
          .join('; ');

      expect(normalise(embedCsp)).toBe(normalise(defaultCsp));
    } finally {
      await Promise.all([embedApp.close(), defaultApp.close()]);
    }
  });
});
