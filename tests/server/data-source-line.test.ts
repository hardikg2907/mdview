import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/render/frontmatter.js';
import { renderMarkdown } from '../../src/render/markdown.js';

function extractDataSourceLines(html: string): Array<{ tag: string; line: string }> {
  const re = /<(h[1-6])\b[^>]*\bdata-source-line="(\d+)"[^>]*>/g;
  const out: Array<{ tag: string; line: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({ tag: m[1]!, line: m[2]! });
  }
  return out;
}

describe('renderMarkdown — data-source-line', () => {
  it('tags headings with their 0-based file line when there is no frontmatter', async () => {
    const source = '# H1\n\ncontent\n\n## H2\n';
    const { body, bodyStartLine } = parseFrontmatter(source);
    const { html } = await renderMarkdown(body, bodyStartLine);
    expect(html).toMatch(/<h1\b[^>]*\bdata-source-line="0"/);
    expect(html).toMatch(/<h2\b[^>]*\bdata-source-line="4"/);
  });

  it('offsets line numbers by the frontmatter length', async () => {
    const source = '---\ntitle: x\nauthor: y\n---\n\n# H1\n## H2\n';
    const { body, bodyStartLine } = parseFrontmatter(source);
    expect(bodyStartLine).toBe(5);
    const { html } = await renderMarkdown(body, bodyStartLine);
    expect(html).toMatch(/<h1\b[^>]*\bdata-source-line="5"/);
    expect(html).toMatch(/<h2\b[^>]*\bdata-source-line="6"/);
  });

  it('emits no data-source-line attribute when there are no headings', async () => {
    const { body, bodyStartLine } = parseFrontmatter('body only\n');
    const { html } = await renderMarkdown(body, bodyStartLine);
    expect(html).not.toContain('data-source-line');
  });

  it('tags all six heading levels with correct file lines', async () => {
    const source = '# A\n## B\n### C\n#### D\n##### E\n###### F\n';
    const { body, bodyStartLine } = parseFrontmatter(source);
    const { html } = await renderMarkdown(body, bodyStartLine);
    const found = extractDataSourceLines(html);
    expect(found).toEqual([
      { tag: 'h1', line: '0' },
      { tag: 'h2', line: '1' },
      { tag: 'h3', line: '2' },
      { tag: 'h4', line: '3' },
      { tag: 'h5', line: '4' },
      { tag: 'h6', line: '5' },
    ]);
  });
});
