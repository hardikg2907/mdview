import { effect } from '@preact/signals';
import { themeSignal } from '../hooks/useTheme.js';

let promise: Promise<typeof import('mermaid')> | null = null;
let counter = 0;
let currentTheme: 'default' | 'dark' | null = null;

function load() {
  if (!promise) promise = import('mermaid');
  return promise;
}

function pickTheme(): 'default' | 'dark' {
  return themeSignal.value === 'dark' ? 'dark' : 'default';
}

export async function renderMermaidIn(root: HTMLElement): Promise<void> {
  const blocks = root.querySelectorAll<HTMLDivElement>('.mermaid-block');
  if (blocks.length === 0) return;

  const mod = await load();
  const mermaid = mod.default;
  const desired = pickTheme();
  if (currentTheme !== desired) {
    mermaid.initialize({ startOnLoad: false, theme: desired, securityLevel: 'strict' });
    currentTheme = desired;
    // Force re-render of any blocks rendered under the old theme.
    for (const b of Array.from(blocks)) delete b.dataset.rendered;
  }

  await Promise.all(Array.from(blocks).map((b) => renderBlock(mermaid, b)));
}

type MermaidApi = (typeof import('mermaid'))['default'];

async function renderBlock(mermaid: MermaidApi, block: HTMLDivElement): Promise<void> {
  if (block.dataset.rendered) return;
  const source = decodeURIComponent(block.dataset.source ?? '');
  const id = `mermaid-${++counter}`;
  try {
    // suppressErrors:true makes parse() return false on bad syntax instead of
    // throwing AND avoids mermaid's built-in oversized "Syntax error in text"
    // diagram, which otherwise leaks into the page layout via temp DOM nodes.
    const parsed = await mermaid.parse(source, { suppressErrors: true });
    if (!parsed) {
      writeError(block, 'syntax error');
      return;
    }
    const { svg } = await mermaid.render(id, source);
    block.innerHTML = svg;
    block.dataset.rendered = 'true';
  } catch (err) {
    writeError(block, (err as Error).message);
  } finally {
    cleanupStrayTempNodes(id);
  }
}

function writeError(block: HTMLDivElement, msg: string): void {
  const pre = document.createElement('pre');
  pre.className = 'mermaid-error';
  pre.textContent = `Mermaid: ${msg}`;
  block.replaceChildren(pre);
  block.dataset.rendered = 'true';
}

function cleanupStrayTempNodes(id: string): void {
  // mermaid.render appends temporary elements (id and 'd' + id) directly to
  // document.body during rendering; on failure they can persist and the error
  // SVG ends up visible outside the diagram container.
  for (const candidate of [id, `d${id}`]) {
    const el = document.getElementById(candidate);
    if (el && el.parentElement === document.body) el.remove();
  }
}

// Re-render mermaid blocks when the theme toggles. The first read of
// themeSignal.value subscribes; on import currentTheme is null so this no-ops
// (Content.tsx will trigger the initial render via the wire pipeline).
effect(() => {
  // Subscribe to theme changes; the read itself is the subscription.
  void themeSignal.value;
  if (currentTheme === null) return;
  const root = document.querySelector<HTMLElement>('.markdown-content');
  if (!root) return;
  void renderMermaidIn(root);
});
