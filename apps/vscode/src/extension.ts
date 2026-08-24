import * as vscode from 'vscode';
import { ServerPool } from './server/ServerPool';
import { bundledCliEntry } from './server/ServerHandle';
import { PreviewPanel } from './webview/PreviewPanel';
import { WEBVIEW_PORT } from './webview/host.html';
import { readConfig, buildCliArgs, type PaletteSetting } from './config/loader';
import { resolvePalette, themeKindToPalette } from './theme/palette';
import { probeAndNotify } from './nodeProbe';
import { log } from './output';
import { toWorkspaceRelPath, resolveInsideFolder } from './editor/paths';
import { LoopGuard } from './editor/cursorSync';
import type { KnownIncomingMessage } from './messages/types';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);
const CURSOR_DEBOUNCE_MS = 80;

interface PreviewContext {
  panel: PreviewPanel;
  folder: vscode.WorkspaceFolder;
  paletteSetting: PaletteSetting;
  currentRelPath: string;
  loopGuard: LoopGuard;
  cursorTimer?: ReturnType<typeof setTimeout>;
}

let pool: ServerPool;
const previews = new Map<string, PreviewContext>();

function isMarkdownEditor(editor: vscode.TextEditor): boolean {
  if (editor.document.languageId === 'markdown') return true;
  const fsPath = editor.document.uri.fsPath;
  const ext = fsPath.slice(fsPath.lastIndexOf('.')).toLowerCase();
  return MARKDOWN_EXTENSIONS.has(ext);
}

/** Resolves the workspace folder + forward-slash relPath for a markdown editor. */
function markdownFolderRel(
  editor: vscode.TextEditor,
): { folder: vscode.WorkspaceFolder; relPath: string } | null {
  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!folder) return null;
  const relPath = toWorkspaceRelPath(folder.uri.fsPath, editor.document.uri.fsPath);
  if (!relPath) return null;
  return { folder, relPath };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function openPreview(
  context: vscode.ExtensionContext,
  opts: { forceBrowser?: boolean } = {},
): Promise<void> {
  if (!probeAndNotify()) return;

  const editor = vscode.window.activeTextEditor;
  if (!editor || !isMarkdownEditor(editor)) {
    vscode.window.showInformationMessage('Open a Markdown file to preview it with mdview.');
    return;
  }

  const mfr = markdownFolderRel(editor);
  if (!mfr) {
    vscode.window.showInformationMessage('Open a folder in VS Code to use mdview.');
    return;
  }
  const { folder, relPath } = mfr;

  const cfg = readConfig(folder.uri);
  const palette = resolvePalette(cfg.palette, vscode.window.activeColorTheme.kind);

  let info: { port: number; url: string };
  try {
    const result = await pool.getOrStart(folder.uri, () => ({
      cliEntryPath: bundledCliEntry(context.extensionPath),
      args: buildCliArgs(folder.uri.fsPath, cfg, palette),
      onExit: (code, signal) => {
        log(`mdview server for ${folder.name} exited (code=${code} signal=${signal})`);
        disposePreview(folder.uri.toString());
      },
    }));
    info = result.info;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log(`mdview failed to start for ${folder.name}: ${detail}`);
    vscode.window.showErrorMessage('mdview failed to start. See the mdview output channel for details.');
    return;
  }

  if (opts.forceBrowser || cfg.preview.openIn === 'browser') {
    void vscode.env.openExternal(vscode.Uri.parse(`${info.url}?file=${encodeURIComponent(relPath)}`));
    return;
  }

  const folderKey = folder.uri.toString();
  const existing = previews.get(folderKey);
  if (existing) {
    existing.currentRelPath = relPath;
    existing.panel.reveal();
    existing.panel.postToSpa({ type: 'mdview/set-file', relPath });
    return;
  }

  const panel = new PreviewPanel(context.extensionUri, info.port, relPath);
  const ctx: PreviewContext = {
    panel,
    folder,
    paletteSetting: cfg.palette,
    currentRelPath: relPath,
    loopGuard: new LoopGuard(),
  };
  previews.set(folderKey, ctx);

  // Register the handler before init is sent so no inbound message is missed.
  const msgDisposable = panel.onSpaMessage((msg) => handleSpaMessage(ctx, msg));
  panel.onDispose(() => {
    msgDisposable.dispose();
    if (ctx.cursorTimer) clearTimeout(ctx.cursorTimer);
    previews.delete(folderKey);
  });

  panel.postToSpa({ type: 'mdview/init', webviewPort: WEBVIEW_PORT });
}

// ---------------------------------------------------------------------------
// Inbound (SPA -> extension) — already validated by the dispatcher
// ---------------------------------------------------------------------------

function handleSpaMessage(ctx: PreviewContext, msg: KnownIncomingMessage): void {
  switch (msg.type) {
    case 'mdview/ready':
      ctx.panel.postToSpa({ type: 'mdview/set-file', relPath: ctx.currentRelPath });
      break;
    case 'mdview/internal-link-clicked':
      void openFileInEditor(ctx.folder, msg.relPath);
      break;
    case 'mdview/heading-clicked':
      void moveEditorCursor(ctx, msg.file, msg.line);
      break;
    case 'mdview/error':
      log(`mdview SPA reported an error: ${msg.message.slice(0, 1024)}`);
      break;
  }
}

async function openFileInEditor(folder: vscode.WorkspaceFolder, relPath: string): Promise<void> {
  const abs = resolveInsideFolder(folder.uri.fsPath, relPath);
  if (!abs) {
    log(`internal-link-clicked rejected (outside folder): ${relPath}`);
    return;
  }
  try {
    await vscode.window.showTextDocument(vscode.Uri.file(abs), { preview: false });
  } catch (err) {
    log(`failed to open ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function moveEditorCursor(ctx: PreviewContext, file: string, line: number): Promise<void> {
  const abs = resolveInsideFolder(ctx.folder.uri.fsPath, file);
  if (!abs) {
    log(`heading-clicked rejected (outside folder): ${file}`);
    return;
  }
  try {
    // A heading/outline click is intra-document navigation: reveal in the
    // editor that already shows this file rather than opening a duplicate tab,
    // and never steal focus from the preview the user just clicked in. Only if
    // the file isn't already visible do we open it (kept out of focus).
    const uri = vscode.Uri.file(abs);
    let editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.fsPath === uri.fsPath,
    );
    if (!editor) {
      editor = await vscode.window.showTextDocument(uri, { preview: false, preserveFocus: true });
    }
    // Clamp to the document so a stale line number can't throw.
    const target = Math.min(line, Math.max(0, editor.document.lineCount - 1));
    const pos = new vscode.Position(target, 0);
    ctx.loopGuard.suppressOutbound();
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  } catch (err) {
    log(`failed to move cursor in ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Outbound (extension -> SPA) editor listeners
// ---------------------------------------------------------------------------

function onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
  if (!editor || !isMarkdownEditor(editor)) return;
  const mfr = markdownFolderRel(editor);
  if (!mfr) return;
  const ctx = previews.get(mfr.folder.uri.toString());
  if (!ctx || ctx.currentRelPath === mfr.relPath) return;
  ctx.currentRelPath = mfr.relPath;
  ctx.panel.postToSpa({ type: 'mdview/set-file', relPath: mfr.relPath });
}

function onSelectionChanged(e: vscode.TextEditorSelectionChangeEvent): void {
  if (!isMarkdownEditor(e.textEditor)) return;
  const mfr = markdownFolderRel(e.textEditor);
  if (!mfr) return;
  const ctx = previews.get(mfr.folder.uri.toString());
  if (!ctx || ctx.currentRelPath !== mfr.relPath) return;
  if (ctx.loopGuard.shouldSkipOutbound()) return;

  const line = e.textEditor.selection.active.line;
  if (ctx.cursorTimer) clearTimeout(ctx.cursorTimer);
  ctx.cursorTimer = setTimeout(() => {
    ctx.cursorTimer = undefined;
    ctx.panel.postToSpa({ type: 'mdview/cursor-changed', line, file: mfr.relPath });
  }, CURSOR_DEBOUNCE_MS);
}

function onColorThemeChanged(theme: vscode.ColorTheme): void {
  const palette = themeKindToPalette(theme.kind);
  for (const ctx of previews.values()) {
    if (ctx.paletteSetting === 'auto') {
      ctx.panel.postToSpa({ type: 'mdview/palette-changed', palette });
    }
  }
}

function onWorkspaceFoldersChanged(e: vscode.WorkspaceFoldersChangeEvent): void {
  for (const removed of e.removed) {
    disposePreview(removed.uri.toString());
    pool.disposeFolder(removed.uri);
  }
}

function disposePreview(folderKey: string): void {
  const ctx = previews.get(folderKey);
  if (!ctx) return;
  if (ctx.cursorTimer) clearTimeout(ctx.cursorTimer);
  ctx.panel.dispose(); // onDispose handler removes it from `previews`
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  pool = new ServerPool();

  context.subscriptions.push(
    vscode.commands.registerCommand('mdview.openPreview', () => openPreview(context)),
    vscode.commands.registerCommand('mdview.openInBrowser', () => openPreview(context, { forceBrowser: true })),
    vscode.window.onDidChangeActiveTextEditor(onActiveEditorChanged),
    vscode.window.onDidChangeTextEditorSelection(onSelectionChanged),
    vscode.window.onDidChangeActiveColorTheme(onColorThemeChanged),
    vscode.workspace.onDidChangeWorkspaceFolders(onWorkspaceFoldersChanged),
  );
}

export function deactivate(): void {
  for (const ctx of previews.values()) {
    if (ctx.cursorTimer) clearTimeout(ctx.cursorTimer);
    ctx.panel.dispose();
  }
  previews.clear();
  pool?.disposeAll();
}
