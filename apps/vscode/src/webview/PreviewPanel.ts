import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { buildHostHtml } from './host.html';
import { Dispatcher } from '../messages/dispatcher';
import type { KnownIncomingMessage, OutgoingMessage } from '../messages/types';
import { log } from '../output';

const VIEW_TYPE = 'mdview.preview';

/**
 * A URL on the CLI's server. The token is what lets the page past the server's
 * embed gate; `embed=vscode` switches the SPA into its webview layout, so it is
 * left off for a normal browser tab.
 */
export function buildEmbedUrl(port: number, token: string, relPath: string, embed: boolean): string {
  const params = new URLSearchParams({ file: relPath });
  if (embed) params.set('embed', 'vscode');
  params.set('token', token);
  return `http://127.0.0.1:${port}/?${params.toString()}`;
}

export class PreviewPanel {
  private readonly panel: vscode.WebviewPanel;
  private readonly nonce: string;
  private readonly dispatcher: Dispatcher;
  private readonly disposeEmitter = new vscode.EventEmitter<void>();
  private readonly subscriptions: vscode.Disposable[] = [];

  // Handlers registered via onSpaMessage.
  private readonly spaHandlers = new Set<(msg: KnownIncomingMessage) => void>();

  readonly onDispose: vscode.Event<void> = this.disposeEmitter.event;

  constructor(
    /** The actual port the CLI is listening on. */
    private readonly actualPort: number,
    /** The server's per-launch embed token; see ServerInfo.token. */
    private readonly embedToken: string,
    /** The initial file to display (relative path from workspace root). */
    initialRelPath: string,
  ) {
    // CSPRNG nonce: one per panel, never Math.random.
    this.nonce = crypto.randomBytes(16).toString('base64');

    this.panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      'mdview Preview',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // No portMapping: VS Code 1.126 (Chromium 142) no longer routes iframe
        // navigations through it. The iframe loads the CLI's real port via the
        // webview resource proxy instead (see host.html.ts). The host page is
        // inline and its CSP allows no webview resources, so nothing needs to
        // load from disk.
        localResourceRoots: [],
      },
    );

    this.dispatcher = new Dispatcher({
      'mdview/ready': (msg) => this.broadcastToHandlers(msg),
      'mdview/internal-link-clicked': (msg) => this.broadcastToHandlers(msg),
      'mdview/heading-clicked': (msg) => this.broadcastToHandlers(msg),
      'mdview/error': (msg) => this.broadcastToHandlers(msg),
    });

    // Wire inbound messages through the validator before any handler sees them.
    this.subscriptions.push(
      this.panel.webview.onDidReceiveMessage((raw: unknown) => {
        this.dispatcher.dispatch(raw);
      }),
    );

    this.subscriptions.push(
      this.panel.onDidDispose(() => {
        // Fire BEFORE cleanup: cleanup() disposes disposeEmitter, and firing a
        // disposed emitter is a no-op — so listeners (e.g. the extension's
        // handler that removes this panel from its per-folder map) must run
        // first. Otherwise a stale, disposed panel lingers in the map and the
        // next "open preview" reuses it → "Webview is disposed".
        this.disposeEmitter.fire();
        this.cleanup();
      }),
    );

    this.setHtml(initialRelPath);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Sends a message to the SPA via the relay.
   */
  postToSpa(msg: OutgoingMessage): void {
    void this.panel.webview.postMessage(msg);
  }

  /**
   * Registers a handler that receives validated incoming messages.
   * Returns a Disposable that removes the handler when disposed.
   */
  onSpaMessage(handler: (msg: KnownIncomingMessage) => void): vscode.Disposable {
    this.spaHandlers.add(handler);
    return new vscode.Disposable(() => {
      this.spaHandlers.delete(handler);
    });
  }

  /** Reveals the panel in the given column, or its current column. */
  reveal(column?: vscode.ViewColumn): void {
    this.panel.reveal(column);
  }

  dispose(): void {
    this.panel.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private setHtml(relPath: string): void {
    const iframeUrl = buildEmbedUrl(this.actualPort, this.embedToken, relPath, true);

    this.panel.webview.html = buildHostHtml({
      iframeUrl,
      nonce: this.nonce,
    });
  }

  private broadcastToHandlers(msg: KnownIncomingMessage): void {
    for (const handler of this.spaHandlers) {
      try {
        handler(msg);
      } catch (err) {
        const detail = err instanceof Error ? err.stack ?? err.message : String(err);
        log(`SPA message handler for ${msg.type} threw: ${detail}`);
      }
    }
  }

  private cleanup(): void {
    for (const sub of this.subscriptions) {
      sub.dispose();
    }
    this.subscriptions.length = 0;
    this.disposeEmitter.dispose();
  }
}
