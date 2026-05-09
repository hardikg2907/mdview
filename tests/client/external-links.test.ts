import { describe, it, expect, beforeEach } from 'vitest';
import { markExternalLinks } from '../../src/client/lib/external-links.js';

function setup(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('markExternalLinks', () => {
  it('marks http(s) links as external with target/_blank and rel attributes', () => {
    const root = setup('<a href="https://example.com">x</a>');
    markExternalLinks(root);
    const a = root.querySelector('a')!;
    expect(a.target).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.classList.contains('is-external')).toBe(true);
    expect(a.querySelector('.external-icon')).not.toBeNull();
  });

  it('matches both http and https case-insensitively', () => {
    const root = setup(
      '<a href="HTTP://a.com">a</a><a href="https://b.com">b</a>',
    );
    markExternalLinks(root);
    root.querySelectorAll('a').forEach((a) => {
      expect(a.classList.contains('is-external')).toBe(true);
    });
  });

  it('skips links flagged as internal (data-internal-link)', () => {
    const root = setup('<a href="https://example.com" data-internal-link="x.md">x</a>');
    markExternalLinks(root);
    const a = root.querySelector('a')!;
    expect(a.classList.contains('is-external')).toBe(false);
    expect(a.querySelector('.external-icon')).toBeNull();
  });

  it('skips heading-anchor permalinks', () => {
    const root = setup('<a class="heading-anchor" href="https://example.com">#</a>');
    markExternalLinks(root);
    expect(root.querySelector('a')!.classList.contains('is-external')).toBe(false);
  });

  it('leaves non-http(s) links alone (relative, mailto, anchor)', () => {
    const root = setup(`
      <a href="mailto:hi@example.com">m</a>
      <a href="other.md">r</a>
      <a href="#section">a</a>
    `);
    markExternalLinks(root);
    root.querySelectorAll('a').forEach((a) => {
      expect(a.classList.contains('is-external')).toBe(false);
      expect(a.querySelector('.external-icon')).toBeNull();
    });
  });

  it('is idempotent — running twice does not duplicate the icon', () => {
    const root = setup('<a href="https://example.com">x</a>');
    markExternalLinks(root);
    markExternalLinks(root);
    const icons = root.querySelectorAll('.external-icon');
    expect(icons.length).toBe(1);
  });

  it('processes multiple links in one pass', () => {
    const root = setup(
      '<a href="https://a.com">a</a><a href="https://b.com">b</a><a href="rel.md">c</a>',
    );
    markExternalLinks(root);
    expect(root.querySelectorAll('a.is-external').length).toBe(2);
  });
});
