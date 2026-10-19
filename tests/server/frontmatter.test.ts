import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/render/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses YAML front matter and strips it from body', () => {
    const raw = '---\ntitle: Hi\ntags: [a, b]\n---\n# Body';
    const { data, body, bodyStartLine } = parseFrontmatter(raw);
    expect(data).toEqual({ title: 'Hi', tags: ['a', 'b'] });
    expect(body).toBe('# Body');
    expect(bodyStartLine).toBe(4);
  });

  it('returns null data for files without front matter', () => {
    const { data, body, bodyStartLine } = parseFrontmatter('# Just a heading');
    expect(data).toBeNull();
    expect(body).toBe('# Just a heading');
    expect(bodyStartLine).toBe(0);
  });

  it('handles empty front matter block', () => {
    const { data, body, bodyStartLine } = parseFrontmatter('---\n---\nbody');
    expect(data).toEqual({});
    expect(body).toBe('body');
    expect(bodyStartLine).toBe(2);
  });
});

describe('parseFrontmatter hardening', () => {
  it.each(['js', 'javascript'])('does not evaluate ---%s front matter', (lang) => {
    const raw = `---${lang}\n{ x: process.pid }\n---\n# Hello`;
    const result = parseFrontmatter(raw);
    expect(result.data).toBeNull();
    expect(result.body).toBe(raw);
    expect(result.bodyStartLine).toBe(0);
  });

  it('treats a BOM before the opening delimiter as no front matter', () => {
    const raw = '﻿---\ntitle: Hi\n---\nbody';
    expect(parseFrontmatter(raw)).toEqual({ data: null, body: raw, bodyStartLine: 0 });
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('parses a plain YAML block (%s)', (_name, eol) => {
    const raw = ['---', 'title: Hi', 'tags:', '  - a', '  - b', 'meta:', '  author: Me', '---', '', '# Body', 'text'].join(eol);
    const { data, body, bodyStartLine } = parseFrontmatter(raw);
    expect(data).toEqual({ title: 'Hi', tags: ['a', 'b'], meta: { author: 'Me' } });
    expect(body).toBe(['# Body', 'text'].join(eol));
    expect(bodyStartLine).toBe(9);
  });

  it('parses a YAML date as a Date so JSON output stays an ISO string', () => {
    const { data } = parseFrontmatter('---\ndate: 2024-01-02\n---\nbody');
    expect(data?.date).toBeInstanceOf(Date);
    expect(JSON.stringify(data)).toBe('{"date":"2024-01-02T00:00:00.000Z"}');
  });

  it('gives null data for a scalar block but still strips it', () => {
    const { data, body } = parseFrontmatter('---\njust text\n---\nbody');
    expect(data).toBeNull();
    expect(body).toBe('body');
  });

  it('gives null data for a list block', () => {
    expect(parseFrontmatter('---\n- a\n- b\n---\nbody').data).toBeNull();
  });

  it('gives null data for a top-level binary block', () => {
    expect(parseFrontmatter('---\n!!binary aGVsbG8=\n---\nbody').data).toBeNull();
  });

  it('rejects an alias bomb quickly', () => {
    const lines = ['a0: &a0 [' + Array.from({ length: 10 }, (_, i) => `"s${i}"`).join(', ') + ']'];
    for (let n = 1; n <= 7; n++) {
      lines.push(`a${n}: &a${n} [${Array.from({ length: 10 }, () => `*a${n - 1}`).join(', ')}]`);
    }
    const raw = `---\n${lines.join('\n')}\n---\nbody`;
    const start = Date.now();
    const result = parseFrontmatter(raw);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(result).toEqual({ data: null, body: raw, bodyStartLine: 0 });
  });

  it('rejects a self-referencing alias cycle without throwing', () => {
    const raw = '---\na: &a\n  b: *a\n---\nbody';
    expect(parseFrontmatter(raw).data).toBeNull();
  });

  it('gives null data and the raw body for invalid YAML', () => {
    const raw = '---\nkey: [unclosed\n---\nbody';
    expect(parseFrontmatter(raw)).toEqual({ data: null, body: raw, bodyStartLine: 0 });
  });
});
