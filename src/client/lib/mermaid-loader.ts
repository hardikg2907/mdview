let promise: Promise<typeof import('pele/lazy')> | null = null;
let counter = 0;

function load() {
  if (!promise) promise = import('pele/lazy');
  return promise;
}

export async function renderMermaidIn(root: HTMLElement): Promise<void> {
  const blocks = root.querySelectorAll<HTMLDivElement>('.mermaid-block');
  if (blocks.length === 0) return;

  const pele = await load();
  await Promise.all(Array.from(blocks).map((b) => renderBlock(pele, b)));
}

async function renderBlock(pele: typeof import('pele/lazy'), block: HTMLDivElement): Promise<void> {
  if (block.dataset.rendered) return;
  const source = decodeURIComponent(block.dataset.source ?? '');
  const style = getComputedStyle(block);
  const fontFamily = style.getPropertyValue('--pele-font').trim() || style.fontFamily;
  const fontFamilyMono = style.getPropertyValue('--pele-font-mono').trim() || undefined;
  const contentWidth =
    block.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  try {
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
    block.innerHTML = svg;
    block.dataset.rendered = 'true';
  } catch (err) {
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
