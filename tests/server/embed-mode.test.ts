import { type ChildProcess, execSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/cli.js';
import { createServer, EMBED_TOKEN_HEADER } from '../../src/server/index.js';

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

// Same shape the extension generates: 32 random bytes, base64url.
const TOKEN = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo';

/** The environment the extension spawns the CLI with, minus anything inherited. */
function embedEnv(token: string | null = TOKEN): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.MDVIEW_EMBED_TOKEN;
  if (token !== null) env.MDVIEW_EMBED_TOKEN = token;
  return env;
}

function spawnCli(
  args: string[],
  env: NodeJS.ProcessEnv = embedEnv(),
): Promise<{ child: ChildProcess; firstLine: string; stderr: () => string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd: REPO_ROOT, env });
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
        resolveResult({ child, firstLine: stdoutBuf.slice(0, nl), stderr: () => stderrBuf });
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

function runToExit(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd: REPO_ROOT, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`still running after 5s; stdout: ${stdout}`));
    }, 5000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolveResult({ code, stdout, stderr });
    });
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

  it('never prints the embed token on stdout or stderr', async () => {
    const { child, firstLine, stderr } = await spawnCli(['--vscode', '--port', '0', FIXTURE_ROOT]);
    try {
      expect(JSON.parse(firstLine).event).toBe('ready');
      expect(firstLine).not.toContain(TOKEN);
      // Let the server answer once so any request-time logging would show up.
      const { port } = JSON.parse(firstLine) as { port: number };
      await fetch(`http://127.0.0.1:${port}/?token=${TOKEN}`);
      expect(stderr()).not.toContain(TOKEN);
    } finally {
      child.kill();
    }
  });

  it('refuses to start without MDVIEW_EMBED_TOKEN, with a clear error', async () => {
    const result = await runToExit(['--vscode', '--port', '0', FIXTURE_ROOT], embedEnv(null));
    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('MDVIEW_EMBED_TOKEN');
    expect(result.stderr).not.toContain('unexpected error');
  });

  it('refuses a token that is too short to be a real one', async () => {
    const result = await runToExit(['--vscode', '--port', '0', FIXTURE_ROOT], embedEnv('short'));
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('MDVIEW_EMBED_TOKEN');
    expect(result.stderr).not.toContain('short');
  });

  it('without --vscode emits legacy human-readable output, not JSON', async () => {
    const { child, firstLine } = await spawnCli(['--port', '0', '--no-open', FIXTURE_ROOT], embedEnv(null));
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
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
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
    const { app } = await createServer({
      roots: [{ absPath: tmpRoot, kind: 'dir' }],
      clientDir: CLIENT_DIR,
      embedToken: TOKEN,
    });
    try {
      const res = await app.inject({ method: 'GET', url: `/?token=${TOKEN}` });
      expect(res.statusCode).toBe(200);
      const csp = res.headers['content-security-policy'] as string;
      expect(csp).not.toContain('frame-ancestors');
    } finally {
      await app.close();
    }
  });

  it('default (no embed): frame-ancestors is "none" (not *)', async () => {
    const { app } = await createServer({
      roots: [{ absPath: tmpRoot, kind: 'dir' }],
      clientDir: CLIENT_DIR,
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
    const { app: embedApp } = await createServer({
      roots: [{ absPath: tmpRoot, kind: 'dir' }],
      clientDir: CLIENT_DIR,
      embedToken: TOKEN,
    });
    const { app: defaultApp } = await createServer({
      roots: [{ absPath: tmpRoot, kind: 'dir' }],
      clientDir: CLIENT_DIR,
    });
    try {
      const embedRes = await embedApp.inject({ method: 'GET', url: `/?token=${TOKEN}` });
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

describe('--vscode embed mode: token gate', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), 'mdview-embed-token-'));
    writeFileSync(path.join(tmpRoot, 'README.md'), '# Test\n');
  });

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  async function embedServer() {
    const { app } = await createServer({
      roots: [{ absPath: tmpRoot, kind: 'dir' }],
      clientDir: CLIENT_DIR,
      embedToken: TOKEN,
    });
    return app;
  }

  // Every way to reach the SPA shell: the index, the file itself, the SPA
  // fallback for a client route, and a missing static file.
  const HTML_PATHS = ['/', '/index.html', '/some/client/route', '/assets/missing.js'];

  it.each(HTML_PATHS)('403s the shell at %s without a token', async (url) => {
    const app = await embedServer();
    try {
      for (const method of ['GET', 'HEAD'] as const) {
        const res = await app.inject({ method, url: `${url}?embed=vscode` });
        expect(res.statusCode).toBe(403);
        expect(res.headers['content-type']).toMatch(/^text\/plain/);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        if (method === 'GET') {
          expect(res.body).toBe('Forbidden');
          expect(Number(res.headers['content-length'])).toBe(res.rawPayload.length);
        }
      }
    } finally {
      await app.close();
    }
  });

  it.each(HTML_PATHS)('serves the shell at %s with the right token', async (url) => {
    const app = await embedServer();
    try {
      const res = await app.inject({ method: 'GET', url: `${url}?embed=vscode&token=${TOKEN}` });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/html/);
    } finally {
      await app.close();
    }
  });

  it.each([
    ['a wrong token of the same length', `${TOKEN.slice(0, -1)}x`],
    ['a prefix of the token', TOKEN.slice(0, 10)],
    ['the token with extra characters', `${TOKEN}x`],
    ['an empty token', ''],
  ])('403s the shell for %s', async (_label, token) => {
    const app = await embedServer();
    try {
      const res = await app.inject({ method: 'GET', url: `/?token=${encodeURIComponent(token)}` });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('403s a repeated token parameter, even if one copy is right', async () => {
    const app = await embedServer();
    try {
      const res = await app.inject({ method: 'GET', url: `/?token=${TOKEN}&token=${TOKEN}` });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('403s the API without a token, and serves it with the header or the query', async () => {
    const app = await embedServer();
    try {
      for (const url of ['/api/tree', '/api/file?path=README.md', '/api/search?q=x', '/%61pi/tree']) {
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode, url).toBe(403);
      }
      const wrong = await app.inject({
        method: 'GET',
        url: '/api/tree',
        headers: { [EMBED_TOKEN_HEADER]: `${TOKEN.slice(0, -1)}x` },
      });
      expect(wrong.statusCode).toBe(403);
      const byHeader = await app.inject({
        method: 'GET',
        url: '/api/file?path=README.md',
        headers: { [EMBED_TOKEN_HEADER]: TOKEN },
      });
      expect(byHeader.statusCode).toBe(200);
      const byQuery = await app.inject({ method: 'GET', url: `/api/tree?token=${TOKEN}` });
      expect(byQuery.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('403s the SSE stream without a token', async () => {
    const app = await embedServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/watch' });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('keeps the token and embed flag on the markdown-path redirect', async () => {
    const app = await embedServer();
    try {
      const res = await app.inject({ method: 'GET', url: `/README.md?embed=vscode&token=${TOKEN}` });
      expect(res.statusCode).toBe(302);
      const location = new URLSearchParams(String(res.headers.location).replace(/^\/\?/, ''));
      expect(location.get('file')).toBe('README.md');
      expect(location.get('embed')).toBe('vscode');
      expect(location.get('token')).toBe(TOKEN);
    } finally {
      await app.close();
    }
  });

  it('serves static scripts without a token, so the shell can load them', async () => {
    const app = await embedServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/bootstrap.js' });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('refuses an empty embed token at construction', async () => {
    await expect(
      createServer({ roots: [{ absPath: tmpRoot, kind: 'dir' }], clientDir: CLIENT_DIR, embedToken: '' }),
    ).rejects.toThrow();
  });

  it('leaves a server without an embed token ungated', async () => {
    const { app } = await createServer({
      roots: [{ absPath: tmpRoot, kind: 'dir' }],
      clientDir: CLIENT_DIR,
    });
    try {
      const shell = await app.inject({ method: 'GET', url: '/?embed=vscode' });
      expect(shell.statusCode).toBe(200);
      expect(shell.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      const api = await app.inject({ method: 'GET', url: '/api/tree' });
      expect(api.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
