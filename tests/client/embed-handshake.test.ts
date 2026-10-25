import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushPath } from '../../src/client/hooks/usePathRouting.js';
import {
  __resetForTests,
  apiHeaders,
  embedToken,
  type IncomingMessage,
  isEmbedded,
  onIncoming,
  postToParent,
  withEmbedToken,
} from '../../src/client/lib/embed.js';

const TOKEN = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');

function setSearch(search: string): void {
  Object.defineProperty(window, 'location', { value: { search }, configurable: true });
}

// happy-dom provides window, window.parent, location, etc.
// We augment / mock as needed per test.

function dispatchMessage(
  data: unknown,
  origin = 'https://vscode-webview.net',
  source: Window | null = window.parent,
): void {
  const ev = new MessageEvent('message', { data, origin, source });
  window.dispatchEvent(ev);
}

beforeEach(() => {
  __resetForTests();
  setSearch(`?file=README.md&embed=vscode&token=${TOKEN}`);
});

afterEach(() => {
  __resetForTests();
});

// ---------------------------------------------------------------------------
// isEmbedded
// ---------------------------------------------------------------------------
describe('isEmbedded', () => {
  it('returns false when window.parent === window (not inside an iframe)', () => {
    // In happy-dom, window.parent === window by default.
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
    Object.defineProperty(window, 'location', {
      value: { search: '?embed=vscode' },
      configurable: true,
    });
    expect(isEmbedded()).toBe(false);
  });

  it('returns false when embed query is absent (even inside an iframe)', () => {
    const fakeParent = {} as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      configurable: true,
    });
    expect(isEmbedded()).toBe(false);
  });

  it('returns false when embed query is not exactly vscode', () => {
    const fakeParent = {} as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
    Object.defineProperty(window, 'location', {
      value: { search: '?embed=browser' },
      configurable: true,
    });
    expect(isEmbedded()).toBe(false);
  });

  it('returns true when inside an iframe AND embed=vscode is present', () => {
    const fakeParent = {} as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
    Object.defineProperty(window, 'location', {
      value: { search: '?file=README.md&embed=vscode' },
      configurable: true,
    });
    expect(isEmbedded()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// postToParent — buffering before handshake
// ---------------------------------------------------------------------------
describe('postToParent — buffering', () => {
  it('does NOT call parent.postMessage before the handshake', () => {
    const postMessageMock = vi.fn();
    const fakeParent = { postMessage: postMessageMock } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });

    postToParent({ type: 'mdview/ready' });
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it('buffers multiple messages and flushes them all on handshake', () => {
    const postMessageMock = vi.fn();
    const fakeParent = { postMessage: postMessageMock } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });

    onIncoming(() => {});

    postToParent({ type: 'mdview/ready' });
    postToParent({ type: 'mdview/error', message: 'oops' });
    expect(postMessageMock).not.toHaveBeenCalled();

    const origin = 'https://vscode-webview.net';
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: TOKEN }, origin);

    // Both buffered messages flushed with the captured origin
    expect(postMessageMock).toHaveBeenCalledTimes(2);
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'mdview/ready' }, origin);
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'mdview/error', message: 'oops' }, origin);
  });

  it('posts immediately after handshake without buffering', () => {
    const postMessageMock = vi.fn();
    const fakeParent = { postMessage: postMessageMock } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });

    onIncoming(() => {});
    const origin = 'https://vscode-webview.net';
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: TOKEN }, origin);

    postMessageMock.mockClear();
    postToParent({ type: 'mdview/heading-clicked', line: 5, file: 'README.md' });
    expect(postMessageMock).toHaveBeenCalledOnce();
    expect(postMessageMock).toHaveBeenCalledWith(
      { type: 'mdview/heading-clicked', line: 5, file: 'README.md' },
      origin,
    );
  });
});

// ---------------------------------------------------------------------------
// onIncoming — handshake state machine
// ---------------------------------------------------------------------------
describe('onIncoming — handshake', () => {
  it('drops a non-mdview/init message before the handshake; no parentOrigin captured', () => {
    const received: IncomingMessage[] = [];
    onIncoming((m) => received.push(m));

    dispatchMessage({ type: 'mdview/set-file', relPath: 'README.md' }, 'https://evil.com');
    expect(received).toHaveLength(0);

    // parentOrigin should still be null — confirm by checking that a subsequent
    // postToParent still buffers (does not call parent.postMessage).
    const postMessageMock = vi.fn();
    const fakeParent = { postMessage: postMessageMock } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
    postToParent({ type: 'mdview/ready' });
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it('captures parentOrigin from the first valid mdview/init message', () => {
    const received: IncomingMessage[] = [];
    const postMessageMock = vi.fn();
    const fakeParent = { postMessage: postMessageMock } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });

    onIncoming((m) => received.push(m));
    const origin = 'https://0.vscode-cdn.net';
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: TOKEN }, origin);

    // Handler was called with the init message
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'mdview/init', webviewPort: 7331, token: TOKEN });

    // Subsequent postToParent uses the captured origin
    postToParent({ type: 'mdview/ready' });
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'mdview/ready' }, origin);
  });

  it('drops a pre-handshake mdview/init from a source other than window.parent', () => {
    const received: IncomingMessage[] = [];
    const postMessageMock = vi.fn();
    const fakeParent = { postMessage: postMessageMock } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });

    onIncoming((m) => received.push(m));
    // A different window object posing as the parent — first arriver attack.
    const imposter = { postMessage: vi.fn() } as unknown as Window;
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: TOKEN }, 'https://evil.com', imposter);

    expect(received).toHaveLength(0);
    // parentOrigin should still be null — confirm by buffering behavior.
    postToParent({ type: 'mdview/ready' });
    expect(postMessageMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onIncoming — post-handshake one-shot invariant
// ---------------------------------------------------------------------------
describe('onIncoming — parentOrigin is one-shot', () => {
  it('does not switch parentOrigin if a second mdview/init arrives from a different origin', () => {
    const received: IncomingMessage[] = [];
    const postMessageMock = vi.fn();
    const fakeParent = { postMessage: postMessageMock } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });

    onIncoming((m) => received.push(m));
    const goodOrigin = 'https://vscode-webview.net';
    const evilOrigin = 'https://evil.com';

    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: TOKEN }, goodOrigin);
    expect(received).toHaveLength(1);

    // A second init from a different origin should be DROPPED (it would only
    // be delivered to the handler if origin matched the captured one).
    dispatchMessage({ type: 'mdview/init', webviewPort: 9999, token: TOKEN }, evilOrigin);
    expect(received).toHaveLength(1); // unchanged

    // Outbound still goes to the original origin.
    postMessageMock.mockClear();
    postToParent({ type: 'mdview/ready' });
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'mdview/ready' }, goodOrigin);
  });

  it('ignores a repeated mdview/init from the same origin, so the SPA does not answer it again', () => {
    // The extension answers every mdview/ready with an init. If a repeat init
    // reached the handler, the SPA would answer with ready, and so on forever.
    const received: IncomingMessage[] = [];
    const postMessageMock = vi.fn();
    const fakeParent = { postMessage: postMessageMock } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
    const origin = 'https://vscode-webview.net';

    onIncoming((m) => {
      received.push(m);
      if (m.type === 'mdview/init') postToParent({ type: 'mdview/ready' });
    });
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: TOKEN }, origin);
    expect(received.map((m) => m.type)).toEqual(['mdview/init']);
    expect(postMessageMock).toHaveBeenCalledTimes(1);

    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: TOKEN }, origin);
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: TOKEN }, origin);
    expect(received.map((m) => m.type)).toEqual(['mdview/init']);
    expect(postMessageMock).toHaveBeenCalledTimes(1);

    // Other messages still get through after the repeats.
    dispatchMessage({ type: 'mdview/set-file', relPath: 'a.md' }, origin);
    expect(received.map((m) => m.type)).toEqual(['mdview/init', 'mdview/set-file']);
  });
});

// ---------------------------------------------------------------------------
// onIncoming — post-handshake origin validation
// ---------------------------------------------------------------------------
describe('onIncoming — post-handshake', () => {
  const GOOD_ORIGIN = 'https://vscode-webview.net';

  function setupHandshake(): IncomingMessage[] {
    const received: IncomingMessage[] = [];
    const fakeParent = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
    onIncoming((m) => received.push(m));
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: TOKEN }, GOOD_ORIGIN);
    received.length = 0; // clear the init message from collected
    return received;
  }

  it('drops messages from a different origin after handshake', () => {
    const received = setupHandshake();
    dispatchMessage({ type: 'mdview/set-file', relPath: 'README.md' }, 'https://evil.com');
    expect(received).toHaveLength(0);
  });

  it('drops messages with missing type after handshake', () => {
    const received = setupHandshake();
    dispatchMessage({ notType: 'mdview/set-file' }, GOOD_ORIGIN);
    expect(received).toHaveLength(0);
  });

  it('drops messages with non-string type after handshake', () => {
    const received = setupHandshake();
    dispatchMessage({ type: 42 }, GOOD_ORIGIN);
    expect(received).toHaveLength(0);
  });

  it('drops null data after handshake', () => {
    const received = setupHandshake();
    dispatchMessage(null, GOOD_ORIGIN);
    expect(received).toHaveLength(0);
  });

  it('drops non-object data after handshake', () => {
    const received = setupHandshake();
    dispatchMessage('hello', GOOD_ORIGIN);
    expect(received).toHaveLength(0);
  });

  it('delivers a valid message from the right origin after handshake', () => {
    const received = setupHandshake();
    dispatchMessage({ type: 'mdview/set-file', relPath: 'docs/intro.md' }, GOOD_ORIGIN);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'mdview/set-file', relPath: 'docs/intro.md' });
  });

  it('delivers mdview/cursor-changed from the right origin', () => {
    const received = setupHandshake();
    dispatchMessage({ type: 'mdview/cursor-changed', line: 10, file: 'README.md' }, GOOD_ORIGIN);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'mdview/cursor-changed', line: 10 });
  });

  it('delivers mdview/palette-changed from the right origin', () => {
    const received = setupHandshake();
    dispatchMessage({ type: 'mdview/palette-changed', palette: 'nord' }, GOOD_ORIGIN);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'mdview/palette-changed', palette: 'nord' });
  });
});

// ---------------------------------------------------------------------------
// onIncoming — the init message must carry this page's token
// ---------------------------------------------------------------------------
describe('onIncoming — init token', () => {
  function setup(): { received: IncomingMessage[]; postMessageMock: ReturnType<typeof vi.fn> } {
    const received: IncomingMessage[] = [];
    const postMessageMock = vi.fn();
    const fakeParent = { postMessage: postMessageMock } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
    onIncoming((m) => received.push(m));
    return { received, postMessageMock };
  }

  it.each([
    ['no token', { type: 'mdview/init', webviewPort: 7331 }],
    ['a wrong token', { type: 'mdview/init', webviewPort: 7331, token: `${TOKEN.slice(0, -1)}x` }],
    ['an empty token', { type: 'mdview/init', webviewPort: 7331, token: '' }],
    ['a non-string token', { type: 'mdview/init', webviewPort: 7331, token: 42 }],
  ])('drops an init from the parent with %s, and does not complete the handshake', (_label, init) => {
    const { received, postMessageMock } = setup();
    postToParent({ type: 'mdview/ready' });
    dispatchMessage(init);
    expect(received).toHaveLength(0);
    expect(postMessageMock).not.toHaveBeenCalled();

    // The real init still completes it afterwards.
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: TOKEN });
    expect(received).toHaveLength(1);
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'mdview/ready' }, 'https://vscode-webview.net');
  });

  it('accepts no init at all when the page booted without a token', () => {
    setSearch('?file=README.md&embed=vscode');
    const { received, postMessageMock } = setup();
    postToParent({ type: 'mdview/ready' });
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331 });
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: '' });
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: null });
    expect(received).toHaveLength(0);
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it('keeps the boot token even if the URL changes later', () => {
    const { received } = setup();
    expect(embedToken()).toBe(TOKEN);
    setSearch('?file=README.md&embed=vscode&token=attacker-chosen-value-that-is-long');
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: 'attacker-chosen-value-that-is-long' });
    expect(received).toHaveLength(0);
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331, token: TOKEN });
    expect(received).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// API requests carry the token
// ---------------------------------------------------------------------------
describe('embed token on API requests', () => {
  it('sends the token as a header for fetch and as a query parameter for EventSource', () => {
    expect(apiHeaders()).toEqual({ 'x-mdview-embed-token': TOKEN });
    expect(withEmbedToken('/api/watch')).toBe(`/api/watch?token=${TOKEN}`);
    expect(withEmbedToken('/api/search?q=x')).toBe(`/api/search?q=x&token=${TOKEN}`);
  });

  it('adds nothing when the page has no token', () => {
    setSearch('?file=README.md');
    expect(apiHeaders()).toEqual({});
    expect(withEmbedToken('/api/watch')).toBe('/api/watch');
  });
});

// ---------------------------------------------------------------------------
// pushPath keeps embed and token, so a reload after navigating still works
// ---------------------------------------------------------------------------
describe('pushPath', () => {
  it('keeps embed and token on the new history entry', () => {
    const pushState = vi.spyOn(history, 'pushState').mockImplementation(() => undefined);
    try {
      pushPath('docs/intro.md', '#setup');
      const url = String(pushState.mock.calls[0]?.[2]);
      expect(url.endsWith('#setup')).toBe(true);
      const params = new URLSearchParams(url.slice(1, url.indexOf('#')));
      expect(params.get('file')).toBe('docs/intro.md');
      expect(params.get('embed')).toBe('vscode');
      expect(params.get('token')).toBe(TOKEN);
    } finally {
      pushState.mockRestore();
    }
  });

  it('adds neither when the page has neither', () => {
    setSearch('?file=README.md');
    const pushState = vi.spyOn(history, 'pushState').mockImplementation(() => undefined);
    try {
      pushPath('docs/intro.md');
      expect(pushState.mock.calls[0]?.[2]).toBe('?file=docs%2Fintro.md');
    } finally {
      pushState.mockRestore();
    }
  });
});
