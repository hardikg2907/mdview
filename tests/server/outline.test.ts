import { describe, it, expect } from 'vitest';
import { extractOutline } from '../../src/server/render/outline.js';
import { renderMarkdown } from '../../src/server/render/markdown.js';

describe('extractOutline', () => {
  it('builds a flat outline for a single level', async () => {
    const { tokens } = await renderMarkdown('# A\n# B\n# C');
    const outline = extractOutline(tokens);
    expect(outline).toHaveLength(3);
    expect(outline.map((n) => n.text)).toEqual(['A', 'B', 'C']);
    expect(outline.every((n) => n.children.length === 0)).toBe(true);
  });

  it('nests sub-headings as children', async () => {
    const { tokens } = await renderMarkdown('# A\n## A.1\n### A.1.a\n## A.2\n# B');
    const outline = extractOutline(tokens);
    expect(outline).toHaveLength(2);
    const a = outline[0]!;
    expect(a.text).toBe('A');
    expect(a.children).toHaveLength(2);
    expect(a.children[0]!.text).toBe('A.1');
    expect(a.children[0]!.children[0]!.text).toBe('A.1.a');
  });

  it('handles non-monotonic skips (h1 → h3 with no h2)', async () => {
    const { tokens } = await renderMarkdown('# A\n### deep');
    const outline = extractOutline(tokens);
    expect(outline[0]!.children[0]!.text).toBe('deep');
    expect(outline[0]!.children[0]!.level).toBe(3);
  });

  it('ids match anchor slugs in rendered html', async () => {
    const md = '# Hello World\n## Sub Section!';
    const { tokens, html } = await renderMarkdown(md);
    const outline = extractOutline(tokens);
    for (const node of outline) {
      expect(html).toContain(`id="${node.id}"`);
      for (const child of node.children) {
        expect(html).toContain(`id="${child.id}"`);
      }
    }
  });
});
