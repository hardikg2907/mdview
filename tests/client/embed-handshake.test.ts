import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetForTests,
  type IncomingMessage,
  isEmbedded,
  onIncoming,
  postToParent,
} from '../../src/client/lib/embed.js';

// happy-dom provides window, window.parent, location, etc.
// We augment / mock as needed per test.

function dispatchMessage(data: unknown, origin = 'https://vscode-webview.net'): void {
  const ev = new MessageEvent('message', { data, origin });
  window.dispatchEvent(ev);
}

beforeEach(() => {
  __resetForTests();
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
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331 }, origin);

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
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331 }, origin);

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
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331 }, origin);

    // Handler was called with the init message
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'mdview/init', webviewPort: 7331 });

    // Subsequent postToParent uses the captured origin
    postToParent({ type: 'mdview/ready' });
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'mdview/ready' }, origin);
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
    dispatchMessage({ type: 'mdview/init', webviewPort: 7331 }, GOOD_ORIGIN);
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
