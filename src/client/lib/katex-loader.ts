let katexPromise: Promise<typeof import('katex')> | null = null;
let cssInjected = false;

function load() {
  if (!katexPromise) katexPromise = import('katex');
  return katexPromise;
}

async function ensureCss(): Promise<void> {
  if (cssInjected) return;
  cssInjected = true;
  // Lazy CSS import — Vite resolves the URL at build time and code-splits.
  // Using `?url` keeps the CSS in its own chunk so it only ships when needed.
  const cssUrl = (await import('katex/dist/katex.min.css?url')).default;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssUrl;
  document.head.appendChild(link);
}

export async function renderMathIn(root: HTMLElement): Promise<void> {
  const inlineNodes = root.querySelectorAll<HTMLElement>('span.math-inline:not([data-rendered])');
  const blockNodes = root.querySelectorAll<HTMLElement>('div.math-block:not([data-rendered])');
  if (inlineNodes.length === 0 && blockNodes.length === 0) return;

  const [mod] = await Promise.all([load(), ensureCss()]);
  const katex = mod.default;

  for (const node of inlineNodes) {
    const src = decodeURIComponent(node.dataset.source ?? '');
    try {
      katex.render(src, node, { displayMode: false, throwOnError: false });
    } catch (err) {
      node.textContent = `[math error: ${(err as Error).message}]`;
    }
    node.dataset.rendered = 'true';
  }

  for (const node of blockNodes) {
    const src = decodeURIComponent(node.dataset.source ?? '');
    try {
      katex.render(src, node, { displayMode: true, throwOnError: false });
    } catch (err) {
      node.textContent = `[math error: ${(err as Error).message}]`;
    }
    node.dataset.rendered = 'true';
  }
}
