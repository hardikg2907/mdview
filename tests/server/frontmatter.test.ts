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
