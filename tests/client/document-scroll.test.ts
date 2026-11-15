import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDocumentScroll } from '../../src/client/hooks/useDocumentScroll.js';
import { fileSignal } from '../../src/client/hooks/useFile.js';
import type { RenderedFile } from '../../src/shared/types.js';

const doc = (relPath: string, html = ''): RenderedFile => ({
  relPath,
  html,
  outline: [],
  frontmatter: null,
  title: null,
  lastModified: 0,
});

describe('useDocumentScroll', () => {
  let host: HTMLElement;
  let scroller: HTMLElement;

  function Probe() {
    useDocumentScroll({ current: scroller });
    return null;
  }

  beforeEach(() => {
    host = document.createElement('div');
    scroller = document.createElement('main');
    document.body.append(host, scroller);
    window.location.hash = '';
    fileSignal.value = null;
  });

  afterEach(() => {
    act(() => render(null, host));
    host.remove();
    scroller.remove();
    fileSignal.value = null;
  });

  it('starts at the top when a different document opens', async () => {
    await act(() => render(h(Probe, {}), host));
    await act(() => {
      fileSignal.value = doc('a/one.md');
    });
    scroller.scrollTop = 1500;
    await act(() => {
      fileSignal.value = doc('a/two.md');
    });
    expect(scroller.scrollTop).toBe(0);
  });

  it('keeps the scroll position when the same document reloads', async () => {
    await act(() => render(h(Probe, {}), host));
    await act(() => {
      fileSignal.value = doc('a/one.md');
    });
    scroller.scrollTop = 1500;
    await act(() => {
      fileSignal.value = doc('a/one.md', '<p>new line</p>');
    });
    expect(scroller.scrollTop).toBe(1500);
  });

  it('scrolls to the hash anchor when a document opens with one', async () => {
    window.location.hash = '#target';
    const target = document.createElement('h2');
    target.id = 'target';
    let scrolled = false;
    target.scrollIntoView = () => {
      scrolled = true;
    };
    scroller.append(target);
    await act(() => render(h(Probe, {}), host));
    await act(() => {
      fileSignal.value = doc('a/one.md');
    });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(scrolled).toBe(true);
  });
});
