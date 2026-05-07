import path from 'node:path/posix';
import type { OutlineNode, TreeNode } from '../shared/types.js';

interface TemplateOptions {
  pageTitle: string;
  /** Root-relative path of the current page (forward slashes), e.g. `docs/intro.md`. */
  currentRelPath: string;
  /** Pre-rendered HTML body (post-render pipeline). */
  bodyHtml: string;
  outline: OutlineNode[];
  tree: TreeNode[];
  /** Filenames (in `assets/`) to link as stylesheets. */
  cssAssets: string[];
  /** Site-wide brand label. */
  rootName: string;
  /** Pre-rendered "Updated N ago" line, or null. */
  updatedLabel: string | null;
}

/**
 * How to express a path-relative href from one rendered page to another. The
 * exporter writes `<relPath>.html`, so the link target also gets `.html`.
 */
export function relativeHref(fromRelPath: string, toRelPath: string): string {
  const fromDir = path.dirname(fromRelPath);
  let r = path.relative(fromDir, toRelPath);
  if (!r) r = path.basename(toRelPath);
  return r.split(path.sep).join('/');
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTree(nodes: TreeNode[], currentRelPath: string): string {
  const renderNode = (n: TreeNode): string => {
    if (n.type === 'dir') {
      const inside = (n.children ?? []).map(renderNode).join('');
      return `<details class="tree-dir-group" open><summary class="tree-dir">${htmlEscape(n.name)}</summary><ul>${inside}</ul></details>`;
    }
    if (!n.isMarkdown) {
      return `<li class="tree-file is-disabled" title="${htmlEscape(n.name)}">${htmlEscape(n.name)}</li>`;
    }
    const href = relativeHref(currentRelPath, n.relPath.replace(/\.(md|markdown|mdx)$/i, '.html'));
    const isCurrent = n.relPath === currentRelPath;
    return `<li class="tree-file${isCurrent ? ' is-current' : ''}"><a href="${htmlEscape(href)}">${htmlEscape(n.name)}</a></li>`;
  };
  return `<ul class="tree">${nodes.map(renderNode).join('')}</ul>`;
}

function renderOutline(nodes: OutlineNode[]): string {
  if (nodes.length === 0) return '<div class="outline-empty">No headings</div>';
  const renderNode = (n: OutlineNode): string => {
    const children = n.children.length > 0 ? `<ul class="outline-children">${n.children.map(renderNode).join('')}</ul>` : '';
    return `<li class="outline-li depth-${Math.min(n.level - 1, 5)}"><div class="outline-row"><a class="outline-link" href="#${htmlEscape(n.id)}">${htmlEscape(n.text)}</a></div>${children}</li>`;
  };
  return `<nav class="outline" aria-label="Document outline"><div class="outline-head"><span class="outline-title">On this page</span></div><ul>${nodes.map(renderNode).join('')}</ul></nav>`;
}

const RUNTIME_JS = `
// Static-export runtime: minimal vanilla shim.
(function() {
  var KEY = 'mdview-theme';
  function applyTheme(t) { document.documentElement.dataset.theme = t; }
  function readTheme() {
    try { return localStorage.getItem(KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
    catch (e) { return 'light'; }
  }
  applyTheme(readTheme());
  document.addEventListener('click', function(ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var next = readTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch (e) {}
  });
  // Code-copy buttons
  document.querySelectorAll('pre').forEach(function(pre) {
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.addEventListener('click', function() {
      var code = pre.querySelector('code');
      if (!code) return;
      navigator.clipboard.writeText(code.textContent || '').then(function() {
        btn.textContent = 'Copied';
        setTimeout(function() { btn.textContent = 'Copy'; }, 1200);
      });
    });
    pre.appendChild(btn);
  });
})();
`;

export function renderPage(opts: TemplateOptions): string {
  const treeHtml = renderTree(opts.tree, opts.currentRelPath);
  const outlineHtml = renderOutline(opts.outline);
  const updatedHtml = opts.updatedLabel
    ? `<div class="doc-stats"><span class="doc-stats-updated">${htmlEscape(opts.updatedLabel)}</span></div>`
    : '';
  const cssLinks = opts.cssAssets
    .map((file) => {
      const href = relativeHref(opts.currentRelPath, `assets/${file}`);
      return `<link rel="stylesheet" href="${htmlEscape(href)}">`;
    })
    .join('\n  ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(opts.pageTitle)}</title>
  ${cssLinks}
</head>
<body>
  <div class="app-shell" style="--tree-width:264px;--outline-width:280px">
    <aside class="pane-tree" aria-label="File tree">
      ${treeHtml}
    </aside>
    <header class="pane-header">
      <div class="header-inner">
        <div class="header-left">
          <span class="brand">${htmlEscape(opts.rootName)}</span>
        </div>
        <div class="header-center"></div>
        <div class="header-right">
          <button class="icon-btn" data-theme-toggle aria-label="Toggle theme" title="Toggle theme">⏾</button>
        </div>
      </div>
    </header>
    <main class="pane-main">
      <article class="markdown-body">
        ${updatedHtml}
        <div class="markdown-content">${opts.bodyHtml}</div>
      </article>
    </main>
    <aside class="pane-outline" aria-label="Outline">
      ${outlineHtml}
    </aside>
  </div>
  <script>${RUNTIME_JS}</script>
</body>
</html>`;
}
