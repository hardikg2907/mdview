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
  /** Full iframe URL at the CLI's real port, e.g. http://127.0.0.1:54732/?file=README.md&embed=vscode */
  iframeUrl: string;
  /** Per-panel CSPRNG nonce (base64). */
  nonce: string;
}

/**
 * Builds the host HTML document that VS Code sets as webview.html.
 *
 * Loading the CLI's localhost server into a webview follows exactly what VS
 * Code's built-in Simple Browser does, because Chromium 142 (VS Code 1.126)
 * blocks a webview iframe from navigating directly to http://127.0.0.1:
 *  - the iframe carries NO src in markup; the relay sets it at runtime and
 *    appends this webview's `id` (+ a request id) so the navigation is routed
 *    through VS Code's webview resource proxy instead of a raw localhost load
 *    that Chromium blocks (microsoft/vscode#278184). portMapping no longer
 *    suffices for iframe navigations, so we don't use it.
 *  - the iframe is sandboxed (allow-scripts/forms/same-origin/downloads) and
 *    `frame-src *` is required because the proxied frame's effective URL is
 *    opaque.
 *
 * The relay also bridges postMessages between the extension and the SPA. The
 * iframe's real origin (post-proxy) is opaque, so the relay discovers it from
 * the SPA's first message, locks it, and validates every later inbound message
 * against it plus `e.source === iframe.contentWindow`. The extension re-validates
 * every inbound message regardless (see messages/validate.ts).
 *
 * The only HTML-attribute interpolation is the escaped nonce; the iframe URL is
 * embedded only inside the nonced script as a JSON string literal.
 */
export function buildHostHtml({ iframeUrl, nonce }: BuildHostHtmlOptions): string {
  const safeNonce = escapeHtmlAttr(nonce);

  const relayScript = `(function () {
  var vscode = acquireVsCodeApi();
  var iframe = document.getElementById('spa');
  var iframeOrigin = null;
  var iframeReady = false;
  var pending = [];

  function toIframe(data) {
    // iframeOrigin is discovered from the iframe's first message; until then
    // (the bootstrap init) we post with '*'. The SPA accepts the first init
    // regardless of origin and echoes back, which is when we lock the origin.
    iframe.contentWindow.postMessage(data, iframeOrigin || '*');
  }

  // Why: the extension posts mdview/init as soon as the panel is created, but
  // the SPA only installs its message listener after its module bundle loads
  // over HTTP. postMessage does not buffer for an absent listener, so we queue
  // extension->iframe messages until the iframe 'load' event and flush in order.
  iframe.addEventListener('load', function () {
    iframeReady = true;
    for (var i = 0; i < pending.length; i++) toIframe(pending[i]);
    pending = [];
  });

  window.addEventListener('message', function (e) {
    if (e.source === iframe.contentWindow) {
      // Inbound trust boundary: must come from our iframe. Lock its origin on
      // first contact and reject any later mismatch.
      if (iframeOrigin === null) iframeOrigin = e.origin;
      else if (e.origin !== iframeOrigin) return;
      vscode.postMessage(e.data);
    } else if (iframeReady) {
      toIframe(e.data);
    } else {
      pending.push(e.data);
    }
  });

  // Why: Chromium 142 (VS Code 1.126) blocks a webview iframe from navigating
  // directly to http://127.0.0.1. Carrying this webview's id (and a request id)
  // routes the load through VS Code's resource proxy instead — the mechanism
  // the built-in Simple Browser uses.
  var id = new URLSearchParams(window.location.search).get('id') || '';
  var src = ${JSON.stringify(iframeUrl)};
  src += (src.indexOf('?') < 0 ? '?' : '&') + 'id=' + encodeURIComponent(id) + '&vscodeBrowserReqId=' + Date.now();
  iframe.src = src;
}())`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${safeNonce}'; frame-src *;">
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
  iframe { display: block; width: 100%; height: 100%; border: none; }
</style>
</head>
<body>
<iframe id="spa" sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"></iframe>
<script nonce="${safeNonce}">${relayScript}</script>
</body>
</html>`;
}
