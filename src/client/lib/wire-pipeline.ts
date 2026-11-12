export interface WireContext {
  onInternalNavigate: (relPath: string, hash: string) => void;
  signal?: AbortSignal;
}

export interface Wire {
  name: string;
  run: (root: HTMLElement, ctx: WireContext) => void | Promise<void>;
}

export async function runWires(
  root: HTMLElement,
  ctx: WireContext,
  wires: readonly Wire[],
): Promise<void> {
  for (const w of wires) {
    if (ctx.signal?.aborted) return;
    try {
      await w.run(root, ctx);
    } catch (err) {
      if (ctx.signal?.aborted) return;
      console.error(`[mdview] wire "${w.name}" failed:`, err);
    }
  }
}
