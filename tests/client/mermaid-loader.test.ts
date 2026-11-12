import { beforeEach, describe, expect, it } from 'vitest';
import { renderMathIn } from '../../src/client/lib/katex-loader.js';
import { renderMermaidIn } from '../../src/client/lib/mermaid-loader.js';

function setup(...sources: string[]): HTMLElement {
  const root = document.createElement('div');
  for (const src of sources) {
    const block = document.createElement('div');
    block.className = 'mermaid-block';
    block.dataset.source = encodeURIComponent(src);
    root.appendChild(block);
  }
  document.body.appendChild(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('renderMermaidIn', () => {
  it('renders a valid diagram as an svg and marks the block rendered', async () => {
    const root = setup('flowchart LR\n  A --> B');
    await renderMermaidIn(root);
    const block = root.querySelector<HTMLElement>('.mermaid-block')!;
    expect(block.querySelector('svg.pele')).not.toBeNull();
    expect(block.dataset.rendered).toBe('true');
  });

  it('renders a web click link as an svg anchor', async () => {
    const root = setup('flowchart LR\n  A --> B\n  click A "https://example.com"');
    await renderMermaidIn(root);
    const block = root.querySelector<HTMLElement>('.mermaid-block')!;
    expect(block.querySelector('a[href="https://example.com/"]')).not.toBeNull();
  });

  it('drops a javascript: click link', async () => {
    const root = setup('flowchart LR\n  A --> B\n  click A "javascript:alert(1)"');
    await renderMermaidIn(root);
    const block = root.querySelector<HTMLElement>('.mermaid-block')!;
    expect(block.querySelector('svg')).not.toBeNull();
    expect(block.querySelector('a')).toBeNull();
  });

  it('shows a Mermaid: error as the only child for invalid source', async () => {
    const root = setup('flowchart LR\n  A -->');
    await renderMermaidIn(root);
    const block = root.querySelector<HTMLElement>('.mermaid-block')!;
    expect(block.children.length).toBe(1);
    const pre = block.querySelector('pre.mermaid-error')!;
    expect(pre.textContent?.startsWith('Mermaid:')).toBe(true);
    expect(block.dataset.rendered).toBe('true');
  });

  it('shows error text as text, never as markup', async () => {
    const root = setup('flowchart LR\n  A --> <img src=x onerror=alert(1)>');
    await renderMermaidIn(root);
    const block = root.querySelector<HTMLElement>('.mermaid-block')!;
    expect(block.querySelector('pre.mermaid-error')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(block.querySelector('img')).toBeNull();
  });

  it('leaves a block that is already rendered untouched', async () => {
    const root = setup('flowchart LR\n  A --> B');
    const block = root.querySelector<HTMLElement>('.mermaid-block')!;
    block.dataset.rendered = 'true';
    block.innerHTML = '<p>kept</p>';
    await renderMermaidIn(root);
    expect(block.innerHTML).toBe('<p>kept</p>');
  });

  it('resolves when the root has no mermaid blocks', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>no diagrams</p>';
    await expect(renderMermaidIn(root)).resolves.toBeUndefined();
  });

  it('catches malformed percent-encoding in raw HTML data-source without rejecting', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="mermaid-block" data-source="%E0%A4%A"></div>';
    document.body.appendChild(root);
    await expect(renderMermaidIn(root)).resolves.toBeUndefined();
    const block = root.querySelector<HTMLElement>('.mermaid-block')!;
    expect(block.querySelector('pre.mermaid-error')).not.toBeNull();
    expect(block.dataset.rendered).toBe('true');
  });
});

describe('renderMathIn — malformed data-source', () => {
  it('catches malformed percent-encoding on inline and block math placeholders', async () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<span class="math-inline" data-source="%E0%A4%A"></span>' +
      '<div class="math-block" data-source="%E0%A4%A"></div>';
    document.body.appendChild(root);
    await expect(renderMathIn(root)).resolves.toBeUndefined();
    expect(root.querySelector('.math-inline')!.textContent).toContain('[math error:');
    expect(root.querySelector('.math-block')!.textContent).toContain('[math error:');
  });
});
