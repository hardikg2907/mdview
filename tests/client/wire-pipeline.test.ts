import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWires, type Wire, type WireContext } from '../../src/client/lib/wire-pipeline.js';

const ctx: WireContext = { onInternalNavigate: () => {} };

let consoleSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleSpy.mockRestore();
});

describe('runWires', () => {
  it('runs each wire in order with the same root and context', async () => {
    const root = document.createElement('div');
    const calls: Array<{ name: string; root: HTMLElement; ctx: WireContext }> = [];
    const wires: Wire[] = [
      { name: 'first', run: (r, c) => { calls.push({ name: 'first', root: r, ctx: c }); } },
      { name: 'second', run: (r, c) => { calls.push({ name: 'second', root: r, ctx: c }); } },
    ];
    await runWires(root, ctx, wires);
    expect(calls.map((c) => c.name)).toEqual(['first', 'second']);
    expect(calls[0]!.root).toBe(root);
    expect(calls[0]!.ctx).toBe(ctx);
  });

  it('awaits async wires before moving to the next', async () => {
    const root = document.createElement('div');
    const order: string[] = [];
    const wires: Wire[] = [
      {
        name: 'slow',
        run: async () => {
          await new Promise((r) => setTimeout(r, 5));
          order.push('slow');
        },
      },
      { name: 'fast', run: () => { order.push('fast'); } },
    ];
    await runWires(root, ctx, wires);
    expect(order).toEqual(['slow', 'fast']);
  });

  it('continues running remaining wires when one throws', async () => {
    const root = document.createElement('div');
    const ran: string[] = [];
    const wires: Wire[] = [
      { name: 'good-1', run: () => { ran.push('good-1'); } },
      { name: 'bad', run: () => { throw new Error('boom'); } },
      { name: 'good-2', run: () => { ran.push('good-2'); } },
    ];
    await runWires(root, ctx, wires);
    expect(ran).toEqual(['good-1', 'good-2']);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('logs the failing wire name on error', async () => {
    const root = document.createElement('div');
    const wires: Wire[] = [
      { name: 'breaker', run: () => { throw new Error('boom'); } },
    ];
    await runWires(root, ctx, wires);
    const args = consoleSpy.mock.calls[0]!;
    const joined = args.map((a) => String(a)).join(' ');
    expect(joined).toContain('breaker');
  });

  it('catches rejections from async wires too', async () => {
    const root = document.createElement('div');
    const ran: string[] = [];
    const wires: Wire[] = [
      { name: 'bad-async', run: async () => { throw new Error('async boom'); } },
      { name: 'after', run: () => { ran.push('after'); } },
    ];
    await runWires(root, ctx, wires);
    expect(ran).toEqual(['after']);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('resolves for an empty wire list', async () => {
    const root = document.createElement('div');
    await expect(runWires(root, ctx, [])).resolves.toBeUndefined();
  });
});
