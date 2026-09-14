import { createHighlighter, type Highlighter } from 'shiki';
import { DEFAULT_PALETTE, type Palette } from '../shared/types.js';

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
 * Themes are loaded once for the whole process, not per palette: the
 * highlighter is a singleton and a user can switch palette at any time, so
 * loading lazily would just move the cost to the first switch.
 */
const UNDERLYING_THEMES: string[] = Array.from(
  new Set<string>(Object.values(PALETTE_THEMES).flatMap((t) => [t.light, t.dark])),
);

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: UNDERLYING_THEMES,
      langs: COMMON_LANGUAGES,
    });
  }
  return highlighterPromise;
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
    return highlighter.codeToHtml(code, {
      lang: effectiveLang || 'text',
      themes: PALETTE_THEMES[palette],
      defaultColor: false,
    });
  } catch {
    return `<pre class="shiki shiki-fallback"><code>${escapeHtml(code)}</code></pre>`;
  }
}
