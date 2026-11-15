import { afterAll, describe, expect, it } from 'vitest';
import { closeRegexWorkers, openRegexSession } from '../../src/server/fs/regex-runner.js';

afterAll(async () => {
  await closeRegexWorkers();
});

function run(flags: string, files: string[]) {
  const session = openRegexSession({
    source: 'a',
    flags,
    maxLineLen: 10_000,
    perFileCap: 100,
    budgetMs: 3000,
  });
  return session.match(files).finally(() => session.release());
}

describe('regex worker flags', () => {
  it('finds every match when the request has no g flag', async () => {
    const [file] = await run('i', ['a b A\nxa']);
    expect(file?.total).toBe(3);
    expect(file?.hits).toEqual([
      [0, 0, 1],
      [0, 4, 1],
      [1, 1, 1],
    ]);
  });

  it('does not stop at the first gap when the request has a y flag', async () => {
    const [file] = await run('gy', ['a b a']);
    expect(file?.total).toBe(2);
  });
});
