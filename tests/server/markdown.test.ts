import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/render/markdown.js';

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

  it('emits a mermaid fence as a client-rendered block with the source URL-encoded', async () => {
    const src = 'flowchart LR\n  A --> B\n';
    const { html } = await renderMarkdown('```mermaid\n' + src + '```');
    expect(html).toContain(`<div class="mermaid-block" data-source="${encodeURIComponent(src)}"></div>`);
    expect(html).not.toContain('class="shiki');
    expect(html).not.toContain('<pre');
  });

  it('links bare domains and www hosts, not only full URLs', async () => {
    const { html } = await renderMarkdown('See example.com and www.example.org or https://example.com/a.');
    expect(html).toContain('<a href="http://example.com">example.com</a>');
    expect(html).toContain('<a href="http://www.example.org">www.example.org</a>');
    expect(html).toContain('<a href="https://example.com/a">https://example.com/a</a>');
  });
});
