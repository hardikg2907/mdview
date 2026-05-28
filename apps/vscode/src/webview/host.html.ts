// The fixed port that the webview-side iframe uses. VS Code's portMapping
// option routes requests for this port to the CLI's actual ephemeral port on
// the extension host (or through a tunnel under remote dev).
export const WEBVIEW_PORT = 7331;

// ---------------------------------------------------------------------------
// HTML attribute escaping
// ---------------------------------------------------------------------------

/**
 * Escapes a string for safe interpolation into an HTML attribute value that
 * is delimited by double-quotes. Applied to every string that is embedded
 * into attribute positions — including the nonce (CSPRNG output) and the
 * iframe src (a URL we construct, but defence-in-depth).
 */
export function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Host document builder
// ---------------------------------------------------------------------------

export interface BuildHostHtmlOptions {
  /** The webview-visible port (always WEBVIEW_PORT = 7331). */
  webviewPort: number;
  /** Full iframe src URL, e.g. http://localhost:7331/?file=README.md&embed=vscode */
  iframeUrl: string;
  /** Per-panel CSPRNG nonce (base64). */
  nonce: string;
}

/**
 * Builds the host HTML document that VS Code sets as webview.html.
 *
 * The document contains:
 *  - A strict CSP that allows only the iframe and the nonced relay script.
 *  - A full-viewport iframe pointing at the mdview SPA.
 *  - A small relay script that forwards postMessages between the extension
 *    and the iframe while enforcing the iframe's origin on every inbound
 *    message.
 *
 * No user-supplied data is interpolated into JS string positions. The only
 * values embedded are the escaped nonce, the escaped iframe src, and the
 * constant port number.
 */
export function buildHostHtml({ webviewPort, iframeUrl, nonce }: BuildHostHtmlOptions): string {
  const safeNonce = escapeHtmlAttr(nonce);
  const safeSrc = escapeHtmlAttr(iframeUrl);
  const iframeOrigin = `http://localhost:${webviewPort}`;

  // The relay script is a static pre-known string. No SPA-supplied data is
  // templated into this block — only the constant iframeOrigin string (which
  // is derived from the constant WEBVIEW_PORT, not from any untrusted input).
  const relayScript = `(function () {
  var vscode = acquireVsCodeApi();
  var iframe = document.getElementById('spa');

  // Extension → relay → iframe: the extension-side channel is trusted;
  // forward all messages into the iframe unconditionally.
  window.addEventListener('message', function (e) {
    if (e.source === iframe.contentWindow) {
      // iframe → relay → extension: enforce source AND origin before forwarding.
      // This is the inbound trust boundary — drop anything that doesn't match.
      if (e.origin !== '${iframeOrigin}') return;
      vscode.postMessage(e.data);
    } else {
      // Message arrived via VS Code's secure extension channel.
      iframe.contentWindow.postMessage(e.data, '${iframeOrigin}');
    }
  });
}())`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://localhost:* http://127.0.0.1:*; script-src 'nonce-${safeNonce}'; style-src 'unsafe-inline';">
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
  iframe { display: block; width: 100%; height: 100%; border: none; }
</style>
</head>
<body>
<iframe id="spa" src="${safeSrc}" allow=""></iframe>
<script nonce="${safeNonce}">${relayScript}</script>
</body>
</html>`;
}
