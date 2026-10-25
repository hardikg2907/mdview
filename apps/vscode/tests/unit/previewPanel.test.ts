import { describe, it, expect, vi, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { buildEmbedUrl, PreviewPanel } from '../../src/webview/PreviewPanel';

const TOKEN = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo';

// Capture the underlying mock panel a PreviewPanel creates, so a test can drive
// its lifecycle (simulate the user closing the webview).
function capturePanel(): { get: () => { __fireDispose: () => void } } {
  const orig = vscode.window.createWebviewPanel as unknown as (
    ...a: unknown[]
  ) => { __fireDispose: () => void };
  let panel: { __fireDispose: () => void };
  vi.spyOn(vscode.window, 'createWebviewPanel').mockImplementation(((...args: unknown[]) => {
    panel = orig(...args);
    return panel;
  }) as never);
  return { get: () => panel };
}

describe('PreviewPanel disposal', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fires onDispose to consumers when the webview is closed', () => {
    const captured = capturePanel();
    const p = new PreviewPanel(4321, TOKEN, 'a.md');

    let disposedFired = false;
    p.onDispose(() => {
      disposedFired = true;
    });

    // User closes the webview.
    captured.get().__fireDispose();

    // Regression: cleanup() disposes the internal emitter, so it must run AFTER
    // fire() — otherwise this listener never runs, the caller's per-folder map
    // keeps a disposed panel, and the next "open preview" throws
    // "Webview is disposed" when it reuses the stale entry.
    expect(disposedFired).toBe(true);
  });
});

describe('PreviewPanel webview setup', () => {
  afterEach(() => vi.restoreAllMocks());

  it('frames the server with the embed flag and the token', () => {
    const captured = capturePanel();
    new PreviewPanel(4321, TOKEN, 'docs/a b.md');
    const html = (captured.get() as unknown as { webview: { html: string } }).webview.html;
    const src = JSON.parse(/var src = ("[^"]*");/.exec(html)?.[1] ?? '""') as string;
    const url = new URL(src);
    expect(url.origin).toBe('http://127.0.0.1:4321');
    expect(url.searchParams.get('file')).toBe('docs/a b.md');
    expect(url.searchParams.get('embed')).toBe('vscode');
    expect(url.searchParams.get('token')).toBe(TOKEN);
  });

  it('allows no local resource roots', () => {
    const spy = vi.spyOn(vscode.window, 'createWebviewPanel');
    new PreviewPanel(4321, TOKEN, 'a.md');
    const options = spy.mock.calls[0]?.[3] as { localResourceRoots?: unknown[] };
    expect(options.localResourceRoots).toEqual([]);
  });
});

describe('PreviewPanel handshake', () => {
  afterEach(() => vi.restoreAllMocks());

  interface Webview {
    postMessage: (msg: unknown) => Promise<boolean>;
    __receiveMessage: (msg: unknown) => void;
  }

  it('answers every mdview/ready with an init carrying the token, ahead of the handlers', () => {
    const captured = capturePanel();
    const p = new PreviewPanel(4321, TOKEN, 'a.md');
    const webview = (captured.get() as unknown as { webview: Webview }).webview;
    const log: unknown[] = [];
    vi.spyOn(webview, 'postMessage').mockImplementation(async (msg) => {
      log.push(msg);
      return true;
    });
    p.onSpaMessage((msg) => log.push(`handler:${msg.type}`));

    webview.__receiveMessage({ type: 'mdview/ready' });
    // The frame reloaded: a new document, so a new init.
    webview.__receiveMessage({ type: 'mdview/ready' });

    const init = { type: 'mdview/init', webviewPort: 7331, token: TOKEN };
    expect(log).toEqual([init, 'handler:mdview/ready', init, 'handler:mdview/ready']);
  });

  it('sends no init until the frame reports a load', () => {
    const captured = capturePanel();
    const spy = vi.fn();
    new PreviewPanel(4321, TOKEN, 'a.md');
    const webview = (captured.get() as unknown as { webview: Webview }).webview;
    vi.spyOn(webview, 'postMessage').mockImplementation(spy);
    webview.__receiveMessage({ type: 'mdview/heading-clicked', line: 1, file: 'a.md' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('buildEmbedUrl', () => {
  it('carries the token on a browser URL but leaves embed mode off', () => {
    const url = new URL(buildEmbedUrl(5555, TOKEN, 'README.md', false));
    expect(url.origin).toBe('http://127.0.0.1:5555');
    expect(url.searchParams.get('file')).toBe('README.md');
    expect(url.searchParams.get('token')).toBe(TOKEN);
    expect(url.searchParams.has('embed')).toBe(false);
  });

  it('encodes the path so it cannot add parameters of its own', () => {
    const url = new URL(buildEmbedUrl(5555, TOKEN, 'a&token=evil#x.md', true));
    expect(url.searchParams.get('file')).toBe('a&token=evil#x.md');
    expect(url.searchParams.getAll('token')).toEqual([TOKEN]);
    expect(url.hash).toBe('');
  });
});
