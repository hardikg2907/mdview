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
  const IFRAME_URL = 'http://localhost:7331/?file=README.md&embed=vscode';

  function build(overrides: Partial<Parameters<typeof buildHostHtml>[0]> = {}): string {
    return buildHostHtml({
      webviewPort: WEBVIEW_PORT,
      iframeUrl: IFRAME_URL,
      nonce: NONCE,
      ...overrides,
    });
  }

  it('returns a string', () => {
    expect(typeof build()).toBe('string');
  });

  it('contains the iframe src with the given URL (HTML-escaped)', () => {
    const html = build();
    // The & in the query string is escaped to &amp; in the attribute value.
    expect(html).toContain(`src="${escapeHtmlAttr(IFRAME_URL)}"`);
  });

  it('contains exactly the required CSP', () => {
    const html = build();
    const expectedCsp =
      `default-src 'none'; frame-src http://localhost:* http://127.0.0.1:*; script-src 'nonce-${NONCE}'; style-src 'unsafe-inline';`;
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

  it('escapes an iframe src that contains HTML-special characters', () => {
    const unsafeUrl = 'http://localhost:7331/?file=a"b<c>d&e=f';
    const html = build({ iframeUrl: unsafeUrl });
    expect(html).not.toContain(unsafeUrl);
    expect(html).toContain('http://localhost:7331/?file=a&quot;b&lt;c&gt;d&amp;e=f');
  });

  it('uses port 7331 in the relay origin check', () => {
    const html = build();
    expect(html).toContain('http://localhost:7331');
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

  it('contains iframe source AND origin check in relay', () => {
    const html = build();
    // The relay must check e.source === iframe.contentWindow.
    expect(html).toContain('iframe.contentWindow');
    // The relay must check e.origin.
    expect(html).toContain("e.origin !== 'http://localhost:7331'");
  });
});
