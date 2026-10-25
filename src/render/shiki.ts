import { createHash } from 'node:crypto';
import { createHighlighter, type Highlighter } from 'shiki';
import { DEFAULT_PALETTE, type Palette } from '../shared/types.js';
import { ByteLru } from './byte-lru.js';

const COMMON_LANGUAGES = [
  'ts', 'tsx', 'js', 'jsx',
  'python', 'go', 'rust', 'java', 'kotlin',
  'css', 'scss', 'html', 'json', 'yaml', 'toml',
  'bash', 'shell', 'sql', 'md', 'diff', 'dockerfile',
];

/**
 * Palette → the Shiki themes used for its light and dark variants.
 *
 * Only the *requested* palette's pair is rendered into a document. Both its
 * modes are, because the light/dark toggle has to repaint without a refetch;
 * a palette change is a rare settings action and refetches instead. Rendering
 * every palette at once is what this used to do, and it put one CSS variable
 * per (palette, mode) on every single token — 16 of them, which took a
 * 40-line TypeScript block to 337 KB of HTML against 26 KB for one pair.
 */
const PALETTE_THEMES: Record<Palette, { light: string; dark: string }> = {
  // Flexoki has no upstream TextMate theme. `min-light` and `vesper` are the
  // closest bundled stand-ins: both are deliberately low-chroma, which is the
  // one property of Flexoki that a louder theme would contradict.
  flexoki: { light: 'min-light', dark: 'vesper' },
  paper: { light: 'min-light', dark: 'vitesse-dark' },
  solarized: { light: 'solarized-light', dark: 'solarized-dark' },
  everforest: { light: 'everforest-light', dark: 'everforest-dark' },
  'rose-pine': { light: 'rose-pine-dawn', dark: 'rose-pine' },
  kanagawa: { light: 'kanagawa-lotus', dark: 'kanagawa-wave' },
  catppuccin: { light: 'catppuccin-latte', dark: 'catppuccin-mocha' },
  'high-contrast': { light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' },
};

/**
 * Only the default palette's pair is loaded at start-up. Each theme costs
 * several milliseconds of JSON parsing, so loading all fifteen delays the first
 * document by more than 100 ms for palettes most users never pick. Every other
 * palette loads the first time a request asks for it.
 */
const INITIAL_THEMES: string[] = Array.from(new Set(Object.values(PALETTE_THEMES[DEFAULT_PALETTE])));

/**
 * Small inputs for the warm-up, each reaching a different part of a grammar.
 * They are kept short and separate so the event loop can run between them.
 */
const WARM_SNIPPETS: ReadonlyArray<readonly [lang: string, code: string]> = [
  ['ts', "import { a } from './a';\ninterface Row<T> { id: number; value?: T }"],
  ['ts', 'export class Box<T> extends Base implements Row<T> {\n  private items: Map<string, T[]> = new Map();\n}'],
  ['ts', `async function run(x: number, y = \`n:\${x}\`): Promise<void> {\n  const re = /a+b/g; // note\n  for (const [k, v] of m) { if (v.length > 0 && k !== "") await f(k); }\n}`],
  ['js', `const f = (a, b) => { /* c */ return a?.b ?? \`\${b}\`; };\nexport default class A { static x = 1 }`],
  ['json', '{ "a": [1, 2.5, true, null], "b": { "c": "d" } }'],
  ['bash', '#!/bin/bash\nset -e\nfor f in *.md; do echo "$f" | grep -q x && cat "$f"; done'],
  ['python', 'import os\n@dec\ndef f(x: int = 1) -> str:\n    """doc"""\n    return f"{x}" if x else None'],
];

/**
 * Cap on cached highlighted HTML. Live reload re-renders the whole document on
 * every save, and highlighting costs about 0.2 ms per line, so a page of large
 * code blocks would otherwise be re-highlighted in full each time.
 */
const HIGHLIGHT_CACHE_BYTES = 8 * 1024 * 1024;

export const highlightCache = new ByteLru(HIGHLIGHT_CACHE_BYTES);

let highlighterPromise: Promise<Highlighter> | null = null;
const themeLoads = new Map<string, Promise<void>>();

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: INITIAL_THEMES,
      langs: COMMON_LANGUAGES,
    }).catch((err: unknown) => {
      // A rejected promise left in the slot would fail every later request.
      highlighterPromise = null;
      throw err;
    });
  }
  return highlighterPromise;
}

/**
 * Loads the themes a palette needs. Concurrent requests for the same
 * not-yet-loaded theme share one in-flight load instead of each starting their
 * own.
 */
async function ensureThemes(highlighter: Highlighter, palette: Palette): Promise<void> {
  const { light, dark } = PALETTE_THEMES[palette];
  const loaded = highlighter.getLoadedThemes();
  const pending: Promise<void>[] = [];
  for (const theme of new Set([light, dark])) {
    if (loaded.includes(theme)) continue;
    let load = themeLoads.get(theme);
    if (!load) {
      load = highlighter
        .loadTheme(theme as never)
        .then(() => {
          themeLoads.delete(theme);
        })
        .catch((err: unknown) => {
          themeLoads.delete(theme);
          throw err;
        });
      themeLoads.set(theme, load);
    }
    pending.push(load);
  }
  await Promise.all(pending);
}

/**
 * Builds the highlighter ahead of the first request. Never rejects: on failure
 * the first real request retries and reports the error itself.
 */
export async function warmHighlighter(): Promise<void> {
  try {
    const highlighter = await getHighlighter();
    // The regex engine's WebAssembly module is compiled on first use, and each
    // grammar compiles a rule's patterns the first time a line reaches it.
    // Together that is over 80 ms on the first document with a code block.
    // Highlighting the snippets pays it here instead, with a yield between each
    // so a request that arrives mid-warm-up waits for one snippet, not all.
    for (const [lang, snippet] of WARM_SNIPPETS) {
      highlighter.codeToHtml(snippet, {
        lang,
        themes: PALETTE_THEMES[DEFAULT_PALETTE],
        defaultColor: false,
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  } catch {
    // retried by the next highlightCode call
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function highlightCode(
  code: string,
  lang: string,
  palette: Palette = DEFAULT_PALETTE,
): Promise<string> {
  // The hash is fixed-width and the palette is allow-listed, so a language
  // string containing the separator cannot collide with another key.
  const key = `${palette}\0${lang}\0${createHash('sha256').update(code).digest('hex')}`;
  const cached = highlightCache.get(key);
  if (cached !== undefined) return cached;

  const highlighter = await getHighlighter();
  const loaded = highlighter.getLoadedLanguages();
  let effectiveLang = lang;
  if (lang && !loaded.includes(lang as never) && !['text', 'plain', ''].includes(lang)) {
    try {
      await highlighter.loadLanguage(lang as never);
    } catch {
      effectiveLang = 'text';
    }
  }
  try {
    await ensureThemes(highlighter, palette);
    const html = highlighter.codeToHtml(code, {
      lang: effectiveLang || 'text',
      themes: PALETTE_THEMES[palette],
      defaultColor: false,
    });
    highlightCache.set(key, html);
    return html;
  } catch {
    // Not cached: a failed theme load is transient and must not pin the plain
    // fallback in place for the life of the process.
    return `<pre class="shiki shiki-fallback"><code>${escapeHtml(code)}</code></pre>`;
  }
}
