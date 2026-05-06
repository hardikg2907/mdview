import { createHighlighter, type Highlighter } from 'shiki';

const COMMON_LANGUAGES = [
  'ts', 'tsx', 'js', 'jsx',
  'python', 'go', 'rust', 'java', 'kotlin',
  'css', 'scss', 'html', 'json', 'yaml', 'toml',
  'bash', 'shell', 'sql', 'md', 'diff', 'dockerfile',
];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
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
    const html = highlighter.codeToHtml(code, {
      lang: effectiveLang || 'text',
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: 'light',
    });
    return html
      .replace(/&#x3C;/g, '&lt;')
      .replace(/&#x3E;/g, '&gt;')
      .replace(/(&lt;)<\/span><span[^>]*>([\w-]+)<\/span><span([^>]*)>>/g, '<span$3>$1$2&gt;');
  } catch {
    return `<pre class="shiki shiki-fallback"><code>${escapeHtml(code)}</code></pre>`;
  }
}
