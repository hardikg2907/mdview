import { describe, it, expect, vi, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { PreviewPanel } from '../../src/webview/PreviewPanel';

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
    const p = new PreviewPanel(vscode.Uri.file('/ws'), 4321, 'a.md');

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
