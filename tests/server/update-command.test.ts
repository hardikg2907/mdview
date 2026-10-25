import { describe, expect, it, vi } from 'vitest';
import { npmInstallCommand, runUpdateCommand } from '../../src/cli-update.js';
import { fetchLatestVersion, UpdateCheckError } from '../../src/update/latest.js';
import { compareVersions, isNewerVersion, isValidVersion, parseVersion } from '../../src/update/semver.js';

function json(body: string, init: ResponseInit = {}): typeof fetch {
  return (async () => new Response(body, { status: 200, ...init })) as unknown as typeof fetch;
}

function stream(chunks: Uint8Array[]): typeof fetch {
  return (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(c);
          controller.close();
        },
      }),
      { status: 200 },
    )) as unknown as typeof fetch;
}

describe('semver', () => {
  it('accepts plain and prerelease versions', () => {
    for (const v of ['0.0.0', '1.2.3', '10.20.30', '1.0.0-rc.1', '1.0.0-beta', '1.0.0-0.3.7', '1.0.0-x-y.z']) {
      expect(isValidVersion(v), v).toBe(true);
    }
  });

  it('rejects anything else, including control characters and escape sequences', () => {
    for (const v of [
      '',
      '1.2',
      '1.2.3.4',
      'v1.2.3',
      '01.2.3',
      '1.2.3-',
      '1.2.3-01',
      '1.2.3-a..b',
      '1.2.3+build',
      '1.2.3\n',
      '\u001b[31m1.2.3',
      '1.2.3\u001b]0;pwned\u0007',
      '1.2.3 ',
      '1234567890.0.0',
      `1.2.3-${'a'.repeat(60)}`,
      42,
      null,
      undefined,
      {},
    ]) {
      expect(isValidVersion(v), JSON.stringify(v)).toBe(false);
    }
  });

  it('orders versions, with a prerelease before its release', () => {
    const order = [
      '0.9.9',
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.1.0',
      '2.0.0',
      '10.0.0',
    ];
    for (let i = 0; i < order.length - 1; i++) {
      const a = parseVersion(order[i])!;
      const b = parseVersion(order[i + 1])!;
      expect(compareVersions(a, b), `${order[i]} < ${order[i + 1]}`).toBeLessThan(0);
      expect(compareVersions(b, a), `${order[i + 1]} > ${order[i]}`).toBeGreaterThan(0);
    }
    expect(compareVersions(parseVersion('1.2.3')!, parseVersion('1.2.3')!)).toBe(0);
  });

  it('isNewerVersion is false when either side is not a version', () => {
    expect(isNewerVersion('0.12.0', '0.11.0')).toBe(true);
    expect(isNewerVersion('0.12.0', 'unknown')).toBe(false);
    expect(isNewerVersion('junk', '0.11.0')).toBe(false);
  });
});

describe('fetchLatestVersion', () => {
  it('returns latest from a dist-tags answer', async () => {
    expect(await fetchLatestVersion({ fetchFn: json('{"latest":"0.12.0","next":"0.13.0-rc.1"}') })).toBe(
      '0.12.0',
    );
  });

  it('asks the registry over https, refusing redirects, with a timeout and nothing identifying', async () => {
    const fetchFn = vi.fn(json('{"latest":"1.0.0"}'));
    await fetchLatestVersion({ fetchFn });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://registry.npmjs.org/-/package/@hardikg%2fmdview/dist-tags');
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toBeUndefined();
    expect(init.credentials).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('turns every failure into an UpdateCheckError that echoes nothing from the answer', async () => {
    const cases: Array<[string, typeof fetch]> = [
      ['non-200', json('<html>secret</html>', { status: 503 })],
      ['not JSON', json('not json \u001b[2J')],
      ['array', json('["0.12.0"]')],
      ['no latest', json('{"next":"1.0.0"}')],
      ['latest not a string', json('{"latest":12}')],
      ['latest with escape', json('{"latest":"1.0.0\\u001b[2J"}')],
      ['latest with newline', json('{"latest":"1.0.0\\nrm -rf"}')],
      ['latest not semver', json('{"latest":"latest"}')],
      ['refused', (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch],
      ['redirect', (async () => { throw new TypeError('redirect mode is set to error'); }) as unknown as typeof fetch],
    ];
    for (const [name, fetchFn] of cases) {
      const err = await fetchLatestVersion({ fetchFn }).catch((e) => e);
      expect(err, name).toBeInstanceOf(UpdateCheckError);
      expect((err as Error).message, name).not.toMatch(/secret|rm -rf/);
      expect((err as Error).message, name).not.toContain('\u001b');
    }
  });

  it('refuses an oversized body declared in content-length', async () => {
    const fetchFn = json('{"latest":"1.0.0"}', { headers: { 'content-length': String(10 * 1024 * 1024) } });
    await expect(fetchLatestVersion({ fetchFn })).rejects.toThrow(/too large/);
  });

  it('refuses an oversized body that is only visible while streaming, and stops reading', async () => {
    const big = new Uint8Array(40 * 1024).fill(32);
    let pulled = 0;
    const fetchFn = (async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            pulled++;
            controller.enqueue(big);
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    await expect(fetchLatestVersion({ fetchFn, maxBytes: 64 * 1024 })).rejects.toThrow(/too large/);
    // Endless input is cut off after the cap, not read to the end.
    expect(pulled).toBeLessThan(10);
  });

  it('accepts a body split across chunks', async () => {
    const enc = new TextEncoder();
    const fetchFn = stream([enc.encode('{"lat'), enc.encode('est":"0.12.'), enc.encode('0"}')]);
    expect(await fetchLatestVersion({ fetchFn })).toBe('0.12.0');
  });

  it('gives up when the registry does not answer in time', async () => {
    const fetchFn = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    const err = await fetchLatestVersion({ fetchFn, timeoutMs: 30 }).catch((e) => e);
    expect(err).toBeInstanceOf(UpdateCheckError);
    expect((err as Error).message).toMatch(/in time/);
  });

  it('gives up when the body stalls after the headers', async () => {
    const fetchFn = ((_url: string, init: RequestInit) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              init.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
            },
          }),
          { status: 200 },
        ),
      )) as unknown as typeof fetch;
    const err = await fetchLatestVersion({ fetchFn, timeoutMs: 30 }).catch((e) => e);
    expect(err).toBeInstanceOf(UpdateCheckError);
    expect((err as Error).message).toMatch(/in time/);
  });
});

describe('npmInstallCommand', () => {
  const present = { isFile: () => true };

  it('targets the npm beside the running node, pinned to the version', () => {
    expect(
      npmInstallCommand('0.12.0', {
        execPath: '/Users/x/.nvm/versions/node/v22.20.0/bin/node',
        platform: 'darwin',
        ...present,
      }),
    ).toBe('/Users/x/.nvm/versions/node/v22.20.0/bin/npm install -g @hardikg/mdview@0.12.0');
  });

  it('quotes a path with spaces or shell characters for a POSIX shell', () => {
    expect(
      npmInstallCommand('0.12.0', { execPath: '/opt/my node/bin/node', platform: 'linux', ...present }),
    ).toBe("'/opt/my node/bin/npm' install -g @hardikg/mdview@0.12.0");
    expect(
      npmInstallCommand('0.12.0', { execPath: "/opt/it's$(x)/bin/node", platform: 'linux', ...present }),
    ).toBe("'/opt/it'\\''s$(x)/bin/npm' install -g @hardikg/mdview@0.12.0");
  });

  it('uses npm.cmd and double quotes on Windows', () => {
    expect(
      npmInstallCommand('0.12.0', {
        execPath: 'C:\\Program Files\\nodejs\\node.exe',
        platform: 'win32',
        ...present,
      }),
    ).toBe('"C:\\Program Files\\nodejs\\npm.cmd" install -g @hardikg/mdview@0.12.0');
  });

  it('falls back to a bare npm when the file is missing or the path cannot be quoted safely', () => {
    expect(
      npmInstallCommand('0.12.0', { execPath: '/x/bin/node', platform: 'linux', isFile: () => false }),
    ).toBe('npm install -g @hardikg/mdview@0.12.0');
    expect(
      npmInstallCommand('0.12.0', { execPath: '/x\n/bin/node', platform: 'linux', ...present }),
    ).toBe('npm install -g @hardikg/mdview@0.12.0');
    expect(
      npmInstallCommand('0.12.0', { execPath: 'C:\\100%\\node.exe', platform: 'win32', ...present }),
    ).toBe('npm install -g @hardikg/mdview@0.12.0');
  });
});

describe('runUpdateCommand', () => {
  function run(currentVersion: string, fetchFn: typeof fetch) {
    const out: string[] = [];
    const err: string[] = [];
    const code = runUpdateCommand({
      fetchFn,
      currentVersion,
      install: { execPath: '/n/bin/node', platform: 'linux', isFile: () => true },
      log: (l) => out.push(l),
      logError: (l) => err.push(l),
    });
    return code.then((c) => ({ code: c, out, err }));
  }

  it('prints the pinned install command when a newer version exists', async () => {
    const r = await run('0.11.0', json('{"latest":"0.12.0"}'));
    expect(r.code).toBe(0);
    expect(r.out.join('\n')).toContain('mdview 0.11.0 → 0.12.0 is available.');
    expect(r.out).toContain('  /n/bin/npm install -g @hardikg/mdview@0.12.0');
    expect(r.out.join('\n')).toMatch(/restarts itself on the next `mdview` run/);
    expect(r.err).toEqual([]);
  });

  it('says so when up to date', async () => {
    const r = await run('0.12.0', json('{"latest":"0.12.0"}'));
    expect(r).toMatchObject({ code: 0, out: ['mdview 0.12.0 is up to date.'] });
  });

  it('says so when this build is newer than the registry', async () => {
    const r = await run('0.13.0', json('{"latest":"0.12.0"}'));
    expect(r.code).toBe(0);
    expect(r.out).toEqual(['mdview 0.13.0 is newer than the latest release (0.12.0).']);
  });

  it('offers the release over a prerelease build of the same version', async () => {
    const r = await run('0.12.0-rc.1', json('{"latest":"0.12.0"}'));
    expect(r.out[0]).toBe('mdview 0.12.0-rc.1 → 0.12.0 is available.');
  });

  it('does not offer a prerelease tag as an upgrade from its release', async () => {
    const r = await run('0.12.0', json('{"latest":"0.12.0-rc.1"}'));
    expect(r.out[0]).toMatch(/newer than the latest release/);
  });

  it('fails with one line and exit 1 on a bad or hostile answer, never printing it', async () => {
    for (const fetchFn of [
      json('{"latest":"0.12.0\\u001b[2Jhi"}'),
      json('nope', { status: 500 }),
      json('x'.repeat(200_000)),
    ]) {
      const r = await run('0.11.0', fetchFn);
      expect(r.code).toBe(1);
      expect(r.out).toEqual([]);
      expect(r.err).toHaveLength(1);
      expect(r.err[0]).toMatch(/^mdview: could not check for updates: /);
      expect(r.err[0]).not.toContain('\u001b');
      expect(r.err[0]).not.toContain('xxxx');
    }
  });

  it('reports a timeout as a one-line failure', async () => {
    const fetchFn = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    const out: string[] = [];
    const err: string[] = [];
    const code = await runUpdateCommand({
      fetchFn,
      timeoutMs: 20,
      currentVersion: '0.11.0',
      log: (l) => out.push(l),
      logError: (l) => err.push(l),
    });
    expect(code).toBe(1);
    expect(err).toEqual(['mdview: could not check for updates: the registry did not answer in time.']);
  });

  it('refuses to compare when this install has no readable version', async () => {
    const r = await run('unknown', json('{"latest":"0.12.0"}'));
    expect(r.code).toBe(1);
  });
});
