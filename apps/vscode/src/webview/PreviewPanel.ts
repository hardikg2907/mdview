import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { buildHostHtml, WEBVIEW_PORT } from './host.html';
import { Dispatcher } from '../messages/dispatcher';
import type { KnownIncomingMessage, OutgoingMessage } from '../messages/types';

const VIEW_TYPE = 'mdview.preview';

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
    private readonly extensionUri: vscode.Uri,
    /** The actual port the CLI is listening on. */
    actualPort: number,
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
        // portMapping routes iframe requests for localhost:7331 to the CLI's
        // actual ephemeral port, including through VS Code remote tunnels.
        portMapping: [{ webviewPort: WEBVIEW_PORT, extensionHostPort: actualPort }],
        // Empty: all resources are served by the CLI's HTTP server, not via
        // vscode-resource:// URIs. This forbids extension-local resource access.
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
        this.cleanup();
        this.disposeEmitter.fire();
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
    const iframeUrl =
      `http://localhost:${WEBVIEW_PORT}/?file=${encodeURIComponent(relPath)}&embed=vscode`;

    this.panel.webview.html = buildHostHtml({
      webviewPort: WEBVIEW_PORT,
      iframeUrl,
      nonce: this.nonce,
    });
  }

  private broadcastToHandlers(msg: KnownIncomingMessage): void {
    for (const handler of this.spaHandlers) {
      try {
        handler(msg);
      } catch {
        // Individual handler errors must not interrupt other handlers.
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
