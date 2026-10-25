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

describe('renderMarkdown — <meta> and <base> in raw HTML', () => {
  const META_OR_BASE = /<(?:meta|base)(?=[\t\n\f\r />]|$)/i;

  it('drops a meta refresh in an HTML block', async () => {
    const { html } = await renderMarkdown(
      '<meta http-equiv="refresh" content="1;url=http://evil.example">\n\n# After',
    );
    expect(html).not.toMatch(META_OR_BASE);
    expect(html).toContain('id="after"');
  });

  it('drops inline meta and base tags in any case and keeps the text around them', async () => {
    const { html } = await renderMarkdown(
      'a <META HTTP-EQUIV=refresh CONTENT="0;url=http://evil.example"> b <base href="http://evil.example/"> c <meta/> d',
    );
    expect(html).not.toMatch(META_OR_BASE);
    expect(html).toContain('<p>a  b  c  d</p>');
  });

  it('drops a meta tag that never closes, up to the end of its block', async () => {
    const { html } = await renderMarkdown(
      '<div>\n<meta http-equiv="refresh" content="0;url=http://evil.example"\n\nnext paragraph',
    );
    expect(html).not.toMatch(META_OR_BASE);
    expect(html).toContain('<p>next paragraph</p>');
  });

  it('does not rebuild a meta tag from the text around a removed one', async () => {
    const { html } = await renderMarkdown(
      '<div>\n<<meta x>meta http-equiv="refresh" content="0;url=http://evil.example">\n</div>',
    );
    expect(html).not.toMatch(META_OR_BASE);
  });

  it('keeps elements whose names only start with meta or base', async () => {
    const { html } = await renderMarkdown('<svg><metadata>m</metadata></svg>\n\n<basefont>');
    expect(html).toContain('<metadata>m</metadata>');
    expect(html).toContain('<basefont>');
  });

  it('keeps a meta tag shown as code', async () => {
    const { html } = await renderMarkdown('`<meta charset="utf-8">`');
    expect(html).toContain('<code>&lt;meta charset=&quot;utf-8&quot;&gt;</code>');
  });
});
