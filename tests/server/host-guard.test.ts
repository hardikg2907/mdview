import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAllowedHost } from '../../src/server/hosts.js';
import { createServer } from '../../src/server/index.js';

describe('isAllowedHost', () => {
  it('accepts the loopback names a browser actually sends', () => {
    for (const h of [
      '127.0.0.1',
      '127.0.0.1:7331',
      'localhost',
      'localhost:7331',
      '[::1]',
      '[::1]:7331',
      'mdview.localhost',
      'mdview.localhost:7331',
      'docs.mdview.localhost:7331',
    ]) {
      expect(isAllowedHost(h), h).toBe(true);
    }
  });

  it('accepts a bare IPv6 literal even though brackets are the correct form', () => {
    expect(isAllowedHost('::1')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAllowedHost('MDVIEW.LOCALHOST:7331')).toBe(true);
    expect(isAllowedHost('LocalHost')).toBe(true);
  });

  it('rejects any name an attacker could point at loopback', () => {
    for (const h of [
      'evil.com',
      'evil.com:7331',
      'localhost.evil.com',
      'mdview.localhost.evil.com',
      'notlocalhost',
      '192.168.1.10:7331',
      '10.0.0.1',
      // A routable address that merely *looks* loopback-adjacent.
      '127.0.0.1.evil.com',
    ]) {
      expect(isAllowedHost(h), h).toBe(false);
    }
  });

  it('fails closed on a missing or empty Host', () => {
    expect(isAllowedHost(undefined)).toBe(false);
    expect(isAllowedHost('')).toBe(false);
  });

  it('rejects header injection and control characters outright', () => {
    expect(isAllowedHost('localhost\r\nX-Evil: 1')).toBe(false);
    expect(isAllowedHost('localhost\n')).toBe(false);
    expect(isAllowedHost('local host')).toBe(false);
    expect(isAllowedHost('localhost\t')).toBe(false);
  });

  it('rejects an over-long value without running the pattern over it', () => {
    expect(isAllowedHost(`${'a'.repeat(300)}.localhost`)).toBe(false);
  });

  it('rejects a bare or malformed .localhost label', () => {
    expect(isAllowedHost('.localhost')).toBe(false);
    expect(isAllowedHost('-bad.localhost')).toBe(false);
  });
});

describe('Host guard on a live server', () => {
  let root: string;
  let clientDir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'mdview-host-'));
    writeFileSync(path.join(root, 'README.md'), '# Test\n');
    // @fastify/static only needs the directory to exist; no real bundle here.
    clientDir = mkdtempSync(path.join(tmpdir(), 'mdview-host-client-'));
    writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>t</title>');
    app = await createServer({ roots: [{ absPath: root, kind: 'dir' }], clientDir });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(clientDir, { recursive: true, force: true });
  });

  it('serves the API on a loopback Host', async () => {
    const res = await app.inject({ url: '/api/tree', headers: { host: '127.0.0.1:7331' } });
    expect(res.statusCode).toBe(200);
  });

  it('serves the API on a *.localhost Host', async () => {
    const res = await app.inject({ url: '/api/tree', headers: { host: 'mdview.localhost:7331' } });
    expect(res.statusCode).toBe(200);
  });

  it('403s a rebound hostname before it reaches any route', async () => {
    const res = await app.inject({ url: '/api/tree', headers: { host: 'evil.com' } });
    expect(res.statusCode).toBe(403);
    // Generic body — nothing about roots, paths or why it was refused.
    expect(res.body).toBe('Forbidden');
  });

  it('guards every surface, not just the JSON API', async () => {
    for (const url of ['/', '/api/file?path=README.md', '/__asset/x.png', '/api/watch']) {
      const res = await app.inject({ url, headers: { host: 'evil.com' } });
      expect(res.statusCode, url).toBe(403);
    }
  });

  it('serves the SPA shell on an allowed Host', async () => {
    const res = await app.inject({ url: '/', headers: { host: 'localhost' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });
});
