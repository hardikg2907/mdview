import { beforeEach, describe, expect, it } from 'vitest';
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

  it('handles SVG anchors without throwing, sets safe target/rel on them, and marks HTML anchors', () => {
    const root = setup(
      '<svg><a href="https://example.com"><text>x</text></a></svg><a href="https://example.org">y</a>',
    );
    const svgAnchor = root.querySelector('svg a')!;
    expect(svgAnchor).not.toBeInstanceOf(HTMLAnchorElement);
    expect(() => markExternalLinks(root)).not.toThrow();
    expect(svgAnchor.getAttribute('target')).toBe('_blank');
    expect(svgAnchor.getAttribute('rel')).toBe('noopener noreferrer');
    expect(svgAnchor.querySelector('.external-icon')).toBeNull();
    const a = Array.from(root.querySelectorAll('a')).find(
      (n) => n.getAttribute('href') === 'https://example.org',
    )!;
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.classList.contains('is-external')).toBe(true);
  });

  it('marks protocol-relative // links and <area> links with target=_blank and noopener noreferrer', () => {
    const root = setup(
      '<a href="//example.com/path">p</a><map name="m"><area href="https://example.com" shape="rect" coords="0,0,10,10"></map>',
    );
    markExternalLinks(root);
    const a = root.querySelector('a')!;
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.classList.contains('is-external')).toBe(true);

    const area = root.querySelector('area')!;
    expect(area.getAttribute('target')).toBe('_blank');
    expect(area.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('strips javascript:, data:, and vbscript: href and xlink:href attributes', () => {
    const root = setup(
      '<a id="js" href="javascript:void(0)">j</a>' +
        '<a id="obf" href="  java&#10;script:void(0)">o</a>' +
        '<a id="dt" href="data:text/html,hi">d</a>' +
        '<svg><a id="svgjs" xlink:href="javascript:void(0)"><text>s</text></a></svg>',
    );
    markExternalLinks(root);
    expect(root.querySelector('#js')!.hasAttribute('href')).toBe(false);
    expect(root.querySelector('#obf')!.hasAttribute('href')).toBe(false);
    expect(root.querySelector('#dt')!.hasAttribute('href')).toBe(false);
    expect(root.querySelector('#svgjs')!.hasAttribute('xlink:href')).toBe(false);
  });

  it('enforces noopener noreferrer on raw HTML target=_blank and rewrites _top/_parent to _blank', () => {
    const root = setup(
      '<a id="op" href="other.md" target="_blank" rel="opener">o</a>' +
        '<a id="top" href="other.md" target="_top">t</a>',
    );
    markExternalLinks(root);
    expect(root.querySelector('#op')!.getAttribute('rel')).toBe('noopener noreferrer');
    expect(root.querySelector('#top')!.getAttribute('target')).toBe('_blank');
    expect(root.querySelector('#top')!.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
