import { beforeEach, describe, expect, it } from 'vitest';
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

  // Belt-and-suspenders fallback: even if server-side tagging missed a link,
  // an untagged same-origin .md link should still be intercepted instead of
  // letting the browser do a real navigation (which would land on the SPA
  // fallback without ?file= set).
  it('intercepts untagged same-origin .md links and resolves them to a relPath', () => {
    const root = setup('<a href="/scoping/prds/foo.md">x</a>');
    const calls: Array<{ rel: string; hash: string }> = [];
    wireInternalLinks(root, (rel, hash) => calls.push({ rel, hash }));

    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('a')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(calls).toEqual([{ rel: 'scoping/prds/foo.md', hash: '' }]);
  });

  it('decodes percent-encoded pathnames when intercepting untagged .md links', () => {
    const root = setup('<a href="/foo%20bar.md">x</a>');
    const calls: Array<{ rel: string; hash: string }> = [];
    wireInternalLinks(root, (rel, hash) => calls.push({ rel, hash }));

    root.querySelector('a')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(calls).toEqual([{ rel: 'foo bar.md', hash: '' }]);
  });

  it('preserves the hash on untagged .md links', () => {
    const root = setup('<a href="/docs/intro.md#section-2">x</a>');
    const calls: Array<{ rel: string; hash: string }> = [];
    wireInternalLinks(root, (rel, hash) => calls.push({ rel, hash }));

    root.querySelector('a')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(calls).toEqual([{ rel: 'docs/intro.md', hash: '#section-2' }]);
  });

  it('does not intercept untagged links that are not markdown', () => {
    const root = setup('<a href="/other.txt">x</a>');
    const calls: Array<{ rel: string; hash: string }> = [];
    wireInternalLinks(root, (rel, hash) => calls.push({ rel, hash }));

    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('a')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it('does not intercept untagged .md links opened with target=_blank', () => {
    const root = setup('<a href="/foo.md" target="_blank">x</a>');
    const calls: Array<{ rel: string; hash: string }> = [];
    wireInternalLinks(root, (rel, hash) => calls.push({ rel, hash }));

    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('a')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it('does not intercept untagged links flagged for download', () => {
    const root = setup('<a href="/foo.md" download>x</a>');
    const calls: Array<{ rel: string; hash: string }> = [];
    wireInternalLinks(root, (rel, hash) => calls.push({ rel, hash }));

    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('a')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });
});
