import { createHighlighter, type Highlighter } from 'shiki';

const COMMON_LANGUAGES = [
  'ts', 'tsx', 'js', 'jsx',
  'python', 'go', 'rust', 'java', 'kotlin',
  'css', 'scss', 'html', 'json', 'yaml', 'toml',
  'bash', 'shell', 'sql', 'md', 'diff', 'dockerfile',
];

/**
 * Palette+mode → Shiki theme name. Each (palette, mode) variant becomes its
 * own CSS variable on every token (`--shiki-<palette>-<mode>`), and theme.css
 * picks the right one based on `[data-palette][data-theme]`.
 *
 * Underlying Shiki themes are deduped before being loaded (`min-light` is
 * shared by paper-light and nord-light, etc.) — see `UNDERLYING_THEMES`.
 */
const PALETTE_THEME_MAP = {
  'classic-light': 'github-light',
  'classic-dark': 'github-dark',
  'paper-light': 'min-light',
  'paper-dark': 'vitesse-dark',
  'nord-light': 'min-light',
  'nord-dark': 'nord',
  'solarized-light': 'solarized-light',
  'solarized-dark': 'solarized-dark',
  'high-contrast-light': 'github-light-high-contrast',
  'high-contrast-dark': 'github-dark-high-contrast',
} as const;

const UNDERLYING_THEMES: string[] = Array.from(
  new Set<string>(Object.values(PALETTE_THEME_MAP)),
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

export async function highlightCode(code: string, lang: string): Promise<string> {
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
      themes: PALETTE_THEME_MAP,
      defaultColor: false,
    });
  } catch {
    return `<pre class="shiki shiki-fallback"><code>${escapeHtml(code)}</code></pre>`;
  }
}
