import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import { buildHostHtml, escapeHtmlAttr, WEBVIEW_PORT } from '../../src/webview/host.html';

// ---------------------------------------------------------------------------
// escapeHtmlAttr
// ---------------------------------------------------------------------------

describe('escapeHtmlAttr', () => {
  it('escapes double-quotes', () => {
    expect(escapeHtmlAttr('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single-quotes', () => {
    expect(escapeHtmlAttr("it's")).toBe('it&#39;s');
  });

  it('escapes ampersands', () => {
    expect(escapeHtmlAttr('a&b')).toBe('a&amp;b');
  });

  it('escapes < and >', () => {
    expect(escapeHtmlAttr('<script>')).toBe('&lt;script&gt;');
  });

  it('leaves safe characters unchanged', () => {
    expect(escapeHtmlAttr('abc123-_')).toBe('abc123-_');
  });

  it('handles empty string', () => {
    expect(escapeHtmlAttr('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// WEBVIEW_PORT constant
// ---------------------------------------------------------------------------

describe('WEBVIEW_PORT', () => {
  it('is 7331', () => {
    expect(WEBVIEW_PORT).toBe(7331);
  });
});

// ---------------------------------------------------------------------------
// buildHostHtml
// ---------------------------------------------------------------------------

describe('buildHostHtml', () => {
  const NONCE = 'dGVzdG5vbmNlMTIz';
  const IFRAME_URL = 'http://127.0.0.1:54732/?file=README.md&embed=vscode';

  function build(overrides: Partial<Parameters<typeof buildHostHtml>[0]> = {}): string {
    return buildHostHtml({
      iframeUrl: IFRAME_URL,
      nonce: NONCE,
      ...overrides,
    });
  }

  it('returns a string', () => {
    expect(typeof build()).toBe('string');
  });

  it('embeds the iframe URL in the relay script, not as a static src attribute', () => {
    const html = build();
    // The relay sets iframe.src at runtime (after appending the webview id), so
    // there must be no static src= on the iframe, and the URL must appear inside
    // the script as a JSON string literal.
    expect(html).not.toMatch(/<iframe[^>]*\ssrc=/);
    expect(html).toContain(JSON.stringify(IFRAME_URL));
  });

  it('appends the webview id and a request id to the iframe URL at runtime', () => {
    const html = build();
    expect(html).toContain("get('id')");
    expect(html).toContain('vscodeBrowserReqId');
  });

  it('sandboxes the iframe', () => {
    const html = build();
    expect(html).toContain('sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"');
  });

  it('contains exactly the required CSP', () => {
    const html = build();
    const expectedCsp =
      `default-src 'none'; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${NONCE}'; frame-src *;`;
    expect(html).toContain(expectedCsp);
  });

  it('contains a nonced script tag', () => {
    const html = build();
    expect(html).toContain(`<script nonce="${NONCE}">`);
  });

  it('does not contain any script tag without the nonce', () => {
    const html = build();
    // Every <script in the document must carry the nonce attribute.
    const scriptTags = html.match(/<script(?:[^>]*)>/g) ?? [];
    for (const tag of scriptTags) {
      expect(tag).toContain(`nonce="${NONCE}"`);
    }
  });

  it('contains only one script tag', () => {
    const html = build();
    const scriptTags = html.match(/<script/g) ?? [];
    expect(scriptTags).toHaveLength(1);
  });

  it('escapes a nonce that contains HTML-special characters', () => {
    const dangerousNonce = 'ab"cd<ef>gh&ij';
    const html = build({ nonce: dangerousNonce });
    // Raw unescaped nonce must not appear.
    expect(html).not.toContain(dangerousNonce);
    // Escaped form must appear.
    expect(html).toContain('ab&quot;cd&lt;ef&gt;gh&amp;ij');
  });

  it('embeds the iframe URL as a JSON string literal so quotes cannot break out of the script', () => {
    const unsafeUrl = 'http://127.0.0.1:54732/?file=a"b&e=f';
    const html = build({ iframeUrl: unsafeUrl });
    // JSON.stringify escapes the embedded double-quote, so the raw form never
    // appears verbatim inside the script.
    expect(html).toContain(JSON.stringify(unsafeUrl));
    expect(html).toContain('a\\"b');
  });

  it('contains the iframe with id=spa', () => {
    const html = build();
    expect(html).toContain('id="spa"');
  });

  it('does not contain a connect-src directive', () => {
    const html = build();
    expect(html).not.toMatch(/connect-src/);
  });

  it('does not contain img-src directive', () => {
    const html = build();
    expect(html).not.toMatch(/img-src/);
  });

  it('does not contain unsafe-inline in script-src', () => {
    const html = build();
    // The CSP must not allow inline scripts without nonce.
    expect(html).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('contains acquireVsCodeApi call in relay script', () => {
    const html = build();
    expect(html).toContain('acquireVsCodeApi');
  });

  it('validates inbound messages by source and discovered origin', () => {
    const html = build();
    // The relay must gate inbound messages on e.source === iframe.contentWindow.
    expect(html).toContain('iframe.contentWindow');
    // The iframe origin is discovered (post-proxy it is opaque) and locked, then
    // every later inbound message is checked against it.
    expect(html).toContain('iframeOrigin');
    expect(html).toContain('e.origin !== iframeOrigin');
  });
});

// ---------------------------------------------------------------------------
// Relay behaviour — run the real script against a fake webview document
// ---------------------------------------------------------------------------

describe('buildHostHtml relay', () => {
  const HOST_ORIGIN = 'vscode-webview://0abc';

  interface FakeWindow {
    postMessage: ReturnType<typeof vi.fn>;
  }

  function setup() {
    const html = buildHostHtml({ iframeUrl: 'http://127.0.0.1:1/?embed=vscode', nonce: 'n' });
    const script = /<script nonce="n">([\s\S]*?)<\/script>/.exec(html)?.[1];
    if (!script) throw new Error('relay script not found');

    // VS Code's webview host page frames this document and forwards extension
    // messages with contentWindow.postMessage(message, window.origin), so they
    // arrive from window.parent carrying this document's own origin.
    const hostPage: FakeWindow = { postMessage: vi.fn() };
    const spaWindow: FakeWindow = { postMessage: vi.fn() };
    const listeners: Record<string, Array<(e: unknown) => void>> = {};
    const iframeListeners: Record<string, Array<() => void>> = {};
    const iframe = {
      contentWindow: spaWindow,
      src: '',
      addEventListener: (type: string, fn: () => void) => {
        (iframeListeners[type] ??= []).push(fn);
      },
    };
    const toExtension = vi.fn();
    const window = {
      parent: hostPage,
      origin: HOST_ORIGIN,
      location: { search: '?id=wv1' },
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        (listeners[type] ??= []).push(fn);
      },
    };
    runInNewContext(script, {
      window,
      document: { getElementById: () => iframe },
      acquireVsCodeApi: () => ({ postMessage: toExtension }),
      URLSearchParams,
      Date,
    });

    const dispatch = (e: { source: unknown; origin: string; data: unknown }) => {
      for (const fn of listeners.message ?? []) fn(e);
    };
    const load = () => {
      for (const fn of iframeListeners.load ?? []) fn();
    };
    return { hostPage, spaWindow, iframe, toExtension, dispatch, load };
  }

  it('queues extension messages until the iframe loads, then flushes them in order', () => {
    const r = setup();
    r.dispatch({ source: r.hostPage, origin: HOST_ORIGIN, data: { type: 'mdview/init' } });
    r.dispatch({ source: r.hostPage, origin: HOST_ORIGIN, data: { type: 'mdview/theme' } });
    expect(r.spaWindow.postMessage).not.toHaveBeenCalled();
    r.load();
    expect(r.spaWindow.postMessage.mock.calls.map((c) => c[0])).toEqual([
      { type: 'mdview/init' },
      { type: 'mdview/theme' },
    ]);
  });

  it('tells the extension about every load of the frame, so each new document gets an init', () => {
    const r = setup();
    expect(r.toExtension).not.toHaveBeenCalled();
    r.load();
    expect(r.toExtension.mock.calls.map((c) => c[0])).toEqual([{ type: 'mdview/ready' }]);
    // A reload of the frame: the new document has no handshake yet.
    r.load();
    expect(r.toExtension.mock.calls.map((c) => c[0])).toEqual([
      { type: 'mdview/ready' },
      { type: 'mdview/ready' },
    ]);
  });

  it('flushes queued messages before announcing the load', () => {
    const r = setup();
    const order: string[] = [];
    r.spaWindow.postMessage.mockImplementation(() => order.push('to-spa'));
    r.toExtension.mockImplementation(() => order.push('to-extension'));
    r.dispatch({ source: r.hostPage, origin: HOST_ORIGIN, data: { type: 'mdview/set-file' } });
    r.load();
    expect(order).toEqual(['to-spa', 'to-extension']);
  });

  it('relays an extension message straight through once loaded', () => {
    const r = setup();
    r.load();
    r.dispatch({ source: r.hostPage, origin: HOST_ORIGIN, data: { type: 'x' } });
    expect(r.spaWindow.postMessage).toHaveBeenCalledWith({ type: 'x' }, '*');
  });

  it('drops a message from any window other than the host page', () => {
    const r = setup();
    r.load();
    const stranger = { postMessage: vi.fn() };
    r.toExtension.mockClear();
    r.dispatch({ source: stranger, origin: HOST_ORIGIN, data: { type: 'mdview/init' } });
    r.dispatch({ source: null, origin: HOST_ORIGIN, data: { type: 'mdview/init' } });
    expect(r.spaWindow.postMessage).not.toHaveBeenCalled();
    expect(r.toExtension).not.toHaveBeenCalled();
  });

  it('drops a message from the host page window carrying another origin', () => {
    const r = setup();
    r.load();
    r.dispatch({ source: r.hostPage, origin: 'http://evil.test', data: { type: 'x' } });
    expect(r.spaWindow.postMessage).not.toHaveBeenCalled();
  });

  it('forwards SPA messages to the extension and locks the SPA origin', () => {
    const r = setup();
    r.load();
    r.toExtension.mockClear();
    r.dispatch({ source: r.spaWindow, origin: 'http://127.0.0.1:1', data: { type: 'ready' } });
    r.dispatch({ source: r.spaWindow, origin: 'http://other:2', data: { type: 'spoof' } });
    expect(r.toExtension.mock.calls.map((c) => c[0])).toEqual([{ type: 'ready' }]);
    r.dispatch({ source: r.hostPage, origin: HOST_ORIGIN, data: { type: 'x' } });
    expect(r.spaWindow.postMessage).toHaveBeenCalledWith({ type: 'x' }, 'http://127.0.0.1:1');
  });
});
