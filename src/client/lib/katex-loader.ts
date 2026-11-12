let katexPromise: Promise<typeof import('katex')> | null = null;
let cssPromise: Promise<void> | null = null;

function load() {
  if (!katexPromise) {
    katexPromise = import('katex').catch((err) => {
      katexPromise = null;
      throw err;
    });
  }
  return katexPromise;
}

function ensureCss(): Promise<void> {
  if (!cssPromise) {
    // Lazy CSS import — Vite resolves the URL at build time and code-splits.
    // Using `?url` keeps the CSS in its own chunk so it only ships when needed.
    cssPromise = import('katex/dist/katex.min.css?url')
      .then((m) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = m.default;
        document.head.appendChild(link);
      })
      .catch((err) => {
        cssPromise = null;
        throw err;
      });
  }
  return cssPromise;
}

export async function renderMathIn(root: HTMLElement, signal?: AbortSignal): Promise<void> {
  const inlineNodes = root.querySelectorAll<HTMLElement>('span.math-inline:not([data-rendered])');
  const blockNodes = root.querySelectorAll<HTMLElement>('div.math-block:not([data-rendered])');
  if ((inlineNodes.length === 0 && blockNodes.length === 0) || signal?.aborted) return;

  const [mod] = await Promise.all([load(), ensureCss()]);
  if (signal?.aborted) return;
  const katex = mod.default;

  for (const node of inlineNodes) {
    try {
      const src = decodeURIComponent(node.dataset.source ?? '');
      katex.render(src, node, { displayMode: false, throwOnError: false });
    } catch (err) {
      node.textContent = `[math error: ${(err as Error).message}]`;
    }
    node.dataset.rendered = 'true';
  }

  for (const node of blockNodes) {
    try {
      const src = decodeURIComponent(node.dataset.source ?? '');
      katex.render(src, node, { displayMode: true, throwOnError: false });
    } catch (err) {
      node.textContent = `[math error: ${(err as Error).message}]`;
    }
    node.dataset.rendered = 'true';
  }
}
