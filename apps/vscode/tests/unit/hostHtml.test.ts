import { describe, it, expect } from 'vitest';
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
