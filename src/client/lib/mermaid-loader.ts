let promise: Promise<typeof import('pele/lazy')> | null = null;
let counter = 0;

function load() {
  if (!promise) {
    promise = import('pele/lazy').catch((err) => {
      promise = null;
      throw err;
    });
  }
  return promise;
}

export async function renderMermaidIn(root: HTMLElement, signal?: AbortSignal): Promise<void> {
  const blocks = root.querySelectorAll<HTMLDivElement>('.mermaid-block');
  if (blocks.length === 0 || signal?.aborted) return;

  const pele = await load();
  if (signal?.aborted) return;
  await Promise.all(Array.from(blocks).map((b) => renderBlock(pele, b, signal)));
}

async function renderBlock(
  pele: typeof import('pele/lazy'),
  block: HTMLDivElement,
  signal?: AbortSignal,
): Promise<void> {
  if (block.dataset.rendered || signal?.aborted) return;
  const style = getComputedStyle(block);
  const fontFamily = style.getPropertyValue('--pele-font').trim() || style.fontFamily;
  const fontFamilyMono = style.getPropertyValue('--pele-font-mono').trim() || undefined;
  const contentWidth =
    block.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  try {
    const source = decodeURIComponent(block.dataset.source ?? '');
    const { svg } = await pele.renderAsync(source, {
      idPrefix: `mermaid-${++counter}-`,
      // Diagram text can come from untrusted files: links are limited to
      // web/mail schemes and no remote image may load.
      linkSchemes: ['http', 'https', 'mailto'],
      images: false,
      fontFamily,
      fontFamilyMono,
      maxWidth: contentWidth > 0 ? contentWidth : undefined,
    });
    if (signal?.aborted) return;
    block.innerHTML = svg;
    block.dataset.rendered = 'true';
  } catch (err) {
    if (signal?.aborted) return;
    writeError(block, err instanceof Error ? err.message : String(err));
  }
}

function writeError(block: HTMLDivElement, msg: string): void {
  const pre = document.createElement('pre');
  pre.className = 'mermaid-error';
  pre.textContent = `Mermaid: ${msg}`;
  block.replaceChildren(pre);
  block.dataset.rendered = 'true';
}
