export interface WireContext {
  onInternalNavigate: (relPath: string, hash: string) => void;
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
    try {
      await w.run(root, ctx);
    } catch (err) {
      console.error(`[mdview] wire "${w.name}" failed:`, err);
    }
  }
}
