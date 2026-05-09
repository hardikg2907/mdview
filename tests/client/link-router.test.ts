import { describe, it, expect, beforeEach } from 'vitest';
import { wireInternalLinks } from '../../src/client/lib/link-router.js';

function setup(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('wireInternalLinks', () => {
  it('invokes onNavigate with relPath and empty hash for a tagged link', () => {
    const root = setup('<a href="other.md" data-internal-link="other.md">x</a>');
    const calls: Array<{ rel: string; hash: string }> = [];
    wireInternalLinks(root, (rel, hash) => calls.push({ rel, hash }));

    root.querySelector('a')!.click();
    expect(calls).toEqual([{ rel: 'other.md', hash: '' }]);
  });

  it('separates the relPath and the #hash', () => {
    const root = setup(
      '<a href="x" data-internal-link="docs/intro.md#section-2">x</a>',
    );
    const calls: Array<{ rel: string; hash: string }> = [];
    wireInternalLinks(root, (rel, hash) => calls.push({ rel, hash }));

    root.querySelector('a')!.click();
    expect(calls).toEqual([{ rel: 'docs/intro.md', hash: '#section-2' }]);
  });

  it('calls preventDefault on the click event', () => {
    const root = setup('<a href="other.md" data-internal-link="other.md">x</a>');
    wireInternalLinks(root, () => {});

    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('a')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('ignores clicks on links without data-internal-link', () => {
    const root = setup('<a href="https://example.com">x</a>');
    const calls: Array<{ rel: string; hash: string }> = [];
    wireInternalLinks(root, (rel, hash) => calls.push({ rel, hash }));

    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('a')!.dispatchEvent(ev);
    expect(calls).toEqual([]);
    // External clicks must not be hijacked.
    expect(ev.defaultPrevented).toBe(false);
  });

  it('lets clicks through when modifier keys are held (open in new tab)', () => {
    const root = setup('<a href="x" data-internal-link="x.md">x</a>');
    const calls: Array<{ rel: string; hash: string }> = [];
    wireInternalLinks(root, (rel, hash) => calls.push({ rel, hash }));

    for (const mod of ['metaKey', 'ctrlKey', 'shiftKey'] as const) {
      const ev = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        [mod]: true,
      } as MouseEventInit);
      root.querySelector('a')!.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it('handles clicks on a child element inside the link', () => {
    const root = setup(
      '<a href="x" data-internal-link="other.md"><span class="inner">x</span></a>',
    );
    const calls: Array<{ rel: string; hash: string }> = [];
    wireInternalLinks(root, (rel, hash) => calls.push({ rel, hash }));

    root.querySelector('.inner')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(calls).toEqual([{ rel: 'other.md', hash: '' }]);
  });
});
