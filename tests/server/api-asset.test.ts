import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerApiAsset } from '../../src/server/routes/api-asset.js';

describe('GET /__asset/* (extension allow-list)', () => {
  let root: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'mdview-asset-'));
    writeFileSync(path.join(root, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(path.join(root, '.env'), 'SECRET=hunter2');
    writeFileSync(path.join(root, 'config.ts'), 'export const x = 1;');
    writeFileSync(path.join(root, 'secrets.json'), '{"k":"v"}');
    mkdirSync(path.join(root, '.git'));
    writeFileSync(path.join(root, '.git', 'config'), '[core]');

    app = Fastify({ logger: false });
    registerApiAsset(app, root);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('serves allow-listed image extensions', async () => {
    const res = await app.inject({ method: 'GET', url: '/__asset/pic.png' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('404s on dotfile (.env) — extension not in allow-list', async () => {
    const res = await app.inject({ method: 'GET', url: '/__asset/.env' });
    expect(res.statusCode).toBe(404);
  });

  it('404s on source files (.ts)', async () => {
    const res = await app.inject({ method: 'GET', url: '/__asset/config.ts' });
    expect(res.statusCode).toBe(404);
  });

  it('404s on .json (not media)', async () => {
    const res = await app.inject({ method: 'GET', url: '/__asset/secrets.json' });
    expect(res.statusCode).toBe(404);
  });

  it('404s on files inside .git', async () => {
    const res = await app.inject({ method: 'GET', url: '/__asset/.git/config' });
    expect(res.statusCode).toBe(404);
  });

});
