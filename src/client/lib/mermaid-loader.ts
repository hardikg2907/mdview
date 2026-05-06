let promise: Promise<typeof import('mermaid')> | null = null;

function load() {
  if (!promise) promise = import('mermaid');
  return promise;
}

let counter = 0;

export async function renderMermaidIn(root: HTMLElement): Promise<void> {
  const blocks = root.querySelectorAll<HTMLDivElement>('.mermaid-block');
  if (blocks.length === 0) return;

  const mod = await load();
  const mermaid = mod.default;
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });

  await Promise.all(
    Array.from(blocks).map(async (block) => {
      if (block.dataset.rendered) return;
      const source = decodeURIComponent(block.dataset.source ?? '');
      const id = `mermaid-${++counter}`;
      try {
        const { svg } = await mermaid.render(id, source);
        block.innerHTML = svg;
        block.dataset.rendered = 'true';
      } catch (err) {
        block.innerHTML = `<pre class="mermaid-error">${(err as Error).message}</pre>`;
      }
    }),
  );
}
