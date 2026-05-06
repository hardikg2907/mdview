import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/server/render/markdown.js';

describe('renderMarkdown', () => {
  it('renders headings with stable slug ids', async () => {
    const { html } = await renderMarkdown('# Hello World\n\n## A Subheading');
    expect(html).toContain('id="hello-world"');
    expect(html).toContain('id="a-subheading"');
  });

  it('renders GFM tables', async () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |';
    const { html } = await renderMarkdown(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders task lists with checkboxes', async () => {
    const { html } = await renderMarkdown('- [x] done\n- [ ] todo');
    const inputs = html.match(/<input[^>]*>/g) ?? [];
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(inputs.every((tag) => /type="checkbox"/.test(tag))).toBe(true);
    expect(inputs.some((tag) => /\bchecked\b/.test(tag))).toBe(true);
  });

  it('renders strikethrough', async () => {
    const { html } = await renderMarkdown('~~gone~~');
    expect(html).toContain('<s>gone</s>');
  });

  it('linkifies bare URLs in text', async () => {
    const { html } = await renderMarkdown('see https://example.com');
    expect(html).toContain('<a href="https://example.com"');
  });

  it('passes inline HTML through', async () => {
    const { html } = await renderMarkdown('<details><summary>x</summary>y</details>');
    expect(html).toContain('<details>');
  });

  it('returns the raw token list for downstream consumers', async () => {
    const result = await renderMarkdown('# Hi');
    expect(result.tokens.length).toBeGreaterThan(0);
  });
});
