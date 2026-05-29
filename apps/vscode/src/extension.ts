import * as vscode from 'vscode';
import { ServerPool } from './server/ServerPool';
import { bundledCliEntry } from './server/ServerHandle';
import { PreviewPanel } from './webview/PreviewPanel';
import { WEBVIEW_PORT } from './webview/host.html';
import { readConfig, buildCliArgs } from './config/loader';
import { resolvePalette } from './theme/palette';
import { probeAndNotify } from './nodeProbe';
import { log } from './output';
import { toWorkspaceRelPath } from './editor/paths';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);

function isMarkdownEditor(editor: vscode.TextEditor): boolean {
  if (editor.document.languageId === 'markdown') return true;
  const ext = editor.document.uri.fsPath.slice(editor.document.uri.fsPath.lastIndexOf('.')).toLowerCase();
  return MARKDOWN_EXTENSIONS.has(ext);
}

let pool: ServerPool;
const panels = new Map<string, PreviewPanel>();

async function openPreview(context: vscode.ExtensionContext): Promise<void> {
  if (!probeAndNotify()) return;

  const editor = vscode.window.activeTextEditor;
  if (!editor || !isMarkdownEditor(editor)) {
    vscode.window.showInformationMessage('Open a Markdown file to preview it with mdview.');
    return;
  }

  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!folder) {
    vscode.window.showInformationMessage('Open a folder in VS Code to use mdview.');
    return;
  }

  const relPath = toWorkspaceRelPath(folder.uri.fsPath, editor.document.uri.fsPath);
  if (!relPath) {
    vscode.window.showInformationMessage('Open a folder in VS Code to use mdview.');
    return;
  }

  const cfg = readConfig(folder.uri);
  const palette = resolvePalette(cfg.palette, vscode.window.activeColorTheme.kind);

  let info: { port: number; url: string };
  try {
    const result = await pool.getOrStart(folder.uri, () => ({
      cliEntryPath: bundledCliEntry(context.extensionPath),
      args: buildCliArgs(folder.uri.fsPath, cfg, palette),
      onExit: (code, signal) => {
        log(`mdview server for ${folder.name} exited (code=${code} signal=${signal})`);
        panels.get(folder.uri.toString())?.dispose();
        panels.delete(folder.uri.toString());
      },
    }));
    info = result.info;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log(`mdview failed to start for ${folder.name}: ${detail}`);
    vscode.window.showErrorMessage('mdview failed to start. See the mdview output channel for details.');
    return;
  }

  if (cfg.preview.openIn === 'browser') {
    void vscode.env.openExternal(vscode.Uri.parse(`${info.url}?file=${encodeURIComponent(relPath)}`));
    return;
  }

  const folderKey = folder.uri.toString();
  const existing = panels.get(folderKey);
  if (existing) {
    existing.reveal();
    existing.postToSpa({ type: 'mdview/set-file', relPath });
    return;
  }

  const panel = new PreviewPanel(context.extensionUri, info.port, relPath);
  panels.set(folderKey, panel);

  // Register handler first so no ready message can be missed after init is sent.
  const msgDisposable = panel.onSpaMessage((msg) => {
    if (msg.type === 'mdview/ready') {
      panel.postToSpa({ type: 'mdview/set-file', relPath });
    }
  });

  panel.onDispose(() => {
    msgDisposable.dispose();
    panels.delete(folderKey);
  });

  panel.postToSpa({ type: 'mdview/init', webviewPort: WEBVIEW_PORT });
}

export function activate(context: vscode.ExtensionContext): void {
  pool = new ServerPool();

  context.subscriptions.push(
    vscode.commands.registerCommand('mdview.openPreview', () => openPreview(context)),
  );
}

export function deactivate(): void {
  pool?.disposeAll();
  for (const panel of panels.values()) panel.dispose();
  panels.clear();
}
