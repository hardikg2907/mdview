import type { Highlighter } from 'shiki';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Wraps the real highlighter so the test can see which themes load and when,
// without changing what Shiki does.
const state = vi.hoisted(() => ({
  highlighter: undefined as undefined | Highlighter,
  loadThemeCalls: [] as string[],
}));

vi.mock('shiki', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shiki')>();
  return {
    ...actual,
    createHighlighter: async (opts: Parameters<typeof actual.createHighlighter>[0]) => {
      const h = await actual.createHighlighter(opts);
      const original = h.loadTheme.bind(h);
      h.loadTheme = ((...args: Parameters<typeof original>) => {
        state.loadThemeCalls.push(String(args[0]));
        return original(...args);
      }) as typeof h.loadTheme;
      state.highlighter = h;
      return h;
    },
  };
});

describe('per-palette theme loading', () => {
  let highlightCode: typeof import('../../src/render/shiki.js').highlightCode;
  let warmHighlighter: typeof import('../../src/render/shiki.js').warmHighlighter;

  beforeAll(async () => {
    ({ highlightCode, warmHighlighter } = await import('../../src/render/shiki.js'));
  });

  it('starts with only the default palette pair loaded', async () => {
    await warmHighlighter();
    expect(state.highlighter?.getLoadedThemes().sort()).toEqual(['min-light', 'vesper']);
    expect(state.loadThemeCalls).toEqual([]);
  });

  it('does not load another palette until a request asks for it', async () => {
    await highlightCode('const a = 1;', 'ts');
    expect(state.loadThemeCalls).toEqual([]);
  });

  it('loads a new palette once even when many first requests race', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => highlightCode(`const r${i} = ${i};`, 'ts', 'catppuccin')),
    );
    for (const html of results) expect(html).toContain('--shiki-light');
    expect([...state.loadThemeCalls].sort()).toEqual(['catppuccin-latte', 'catppuccin-mocha']);
    expect(state.highlighter?.getLoadedThemes()).toEqual(
      expect.arrayContaining(['catppuccin-latte', 'catppuccin-mocha']),
    );
  });

  it('does not reload a palette that is already loaded', async () => {
    const before = state.loadThemeCalls.length;
    await highlightCode('const again = 1;', 'ts', 'catppuccin');
    expect(state.loadThemeCalls.length).toBe(before);
  });

  it('shares a theme between palettes instead of loading it twice', async () => {
    // `paper` pairs min-light (already loaded for the default) with vitesse-dark.
    await highlightCode('const p = 1;', 'ts', 'paper');
    expect(state.loadThemeCalls.filter((t) => t === 'min-light')).toEqual([]);
    expect(state.loadThemeCalls).toContain('vitesse-dark');
  });
});
