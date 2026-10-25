// Why: embed-mode helpers for the VS Code extension webview integration.
// This module is the sole place that owns the handshake state machine and
// the origin-validated postMessage contract described in spec §15–§16.

export type IncomingMessage = { type: string; [k: string]: unknown };

// --- module-level handshake state (one module = one listener pattern) ---
// Not exported: all callers go through the public API so the invariants hold.
let parentOrigin: string | null = null;
// Read once, from the URL the page booted with, so later history edits cannot
// change which token the handshake and the API calls use.
let bootToken: string | null | undefined;
let buffer: unknown[] = [];
// Only one handler is ever registered. Multiple calls to onIncoming() are
// idempotent because the extension only ever calls it once at bootstrap;
// supporting an array of handlers would add complexity for no gain.
let handler: ((msg: IncomingMessage) => void) | null = null;
// Keep the actual listener reference so it can be removed on reset.
let installedListener: ((e: MessageEvent) => void) | null = null;

// --- isEmbedded ---

/**
 * True iff the SPA is running inside an iframe AND the `?embed=vscode` query
 * is present. Both conditions must hold: an iframe alone (e.g. a test page
 * that embeds the SPA) should not activate embed mode, and the query alone
 * (e.g. a bare browser tab with ?embed=vscode typed in) should not either.
 */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.parent === window) return false;
  return new URLSearchParams(window.location.search).get('embed') === 'vscode';
}

// --- embed token ---

/**
 * The per-launch token the server requires in embed mode, or null when the
 * page was opened without one (a normal browser tab on a non-embed server).
 */
export function embedToken(): string | null {
  if (bootToken === undefined) {
    bootToken =
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('token') || null;
  }
  return bootToken;
}

/** Must match EMBED_TOKEN_HEADER in src/server/index.ts. */
const EMBED_TOKEN_HEADER = 'x-mdview-embed-token';

/** Headers for an /api/* fetch: the embed token when the page has one. */
export function apiHeaders(): Record<string, string> {
  const token = embedToken();
  return token ? { [EMBED_TOKEN_HEADER]: token } : {};
}

/** An /api/* URL with the embed token in the query, for EventSource, which cannot send headers. */
export function withEmbedToken(url: string): string {
  const token = embedToken();
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

// --- postToParent ---

/**
 * Post a message to the parent frame.
 *
 * Before the handshake (parentOrigin not yet known) the message is buffered.
 * Once the handshake completes the buffer is flushed with the captured origin
 * as `targetOrigin`, and future calls post immediately.
 *
 * NEVER uses `'*'` as targetOrigin — security invariant, see spec §15.
 */
export function postToParent(msg: unknown): void {
  if (parentOrigin === null) {
    buffer.push(msg);
    return;
  }
  window.parent.postMessage(msg, parentOrigin);
}

// --- onIncoming ---

/**
 * Install the window `message` listener for embed-mode inbound messages.
 *
 * Handshake rules (before parentOrigin is known):
 *   - Only the first message of type `mdview/init` is accepted, and only when
 *     its `token` equals the token in this page's own URL. The server already
 *     refuses the page to anyone without the token, so this holds even if
 *     that gate is ever bypassed.
 *   - On receipt, `e.origin` is captured as `parentOrigin`.
 *   - Buffered outbound messages are flushed with that origin.
 *   - The handler is then called with the init message.
 *   - All other pre-handshake messages are dropped silently.
 *
 * Post-handshake rules:
 *   - Messages whose `e.origin` does not match `parentOrigin` are dropped.
 *   - Messages whose `e.data` is not an object with a string `type` are dropped.
 *   - The allow-list check (`type` must be a known string) is done by the
 *     caller's dispatcher, not here; unknown types arriving here are delivered
 *     to the handler which drops them silently.
 *   - Valid messages are delivered to the handler.
 */
export function onIncoming(h: (msg: IncomingMessage) => void): void {
  // Why idempotent: the extension bootstrap calls onIncoming once; if anything
  // calls it again we just replace the handler — we do NOT install a second
  // window listener (that would double-deliver every message).
  handler = h;
  if (installedListener !== null) return;

  const listener = (e: MessageEvent): void => {
    if (parentOrigin === null) {
      // Before handshake: only accept an mdview/init message coming from the
      // immediate parent window. The e.source check defends against a third
      // party that races a postMessage into the iframe before VS Code does —
      // without it the first arriver would permanently capture parentOrigin.
      const token = embedToken();
      if (
        e.source === window.parent &&
        e.data !== null &&
        typeof e.data === 'object' &&
        (e.data as Record<string, unknown>).type === 'mdview/init' &&
        token !== null &&
        (e.data as Record<string, unknown>).token === token
      ) {
        parentOrigin = e.origin;
        // Flush buffered outbound messages now that we know the target origin.
        for (const m of buffer) {
          window.parent.postMessage(m, parentOrigin);
        }
        buffer = [];
        handler?.(e.data as IncomingMessage);
      }
      // Any other pre-handshake message is dropped silently.
      return;
    }

    // Post-handshake: validate origin and payload shape.
    if (e.origin !== parentOrigin) return;
    if (
      e.data === null ||
      typeof e.data !== 'object' ||
      typeof (e.data as Record<string, unknown>).type !== 'string'
    ) {
      return;
    }
    handler?.(e.data as IncomingMessage);
  };

  installedListener = listener;
  window.addEventListener('message', listener);
}

// --- test-only reset ---

/**
 * Reset all module-level state.
 *
 * FOR TESTS ONLY. Do not call in production code.
 * Exposed so vitest can reset state between `it` blocks without needing
 * `vi.resetModules()` (which would reload the entire module graph).
 */
export function __resetForTests(): void {
  if (installedListener !== null) {
    window.removeEventListener('message', installedListener);
    installedListener = null;
  }
  parentOrigin = null;
  bootToken = undefined;
  buffer = [];
  handler = null;
}
