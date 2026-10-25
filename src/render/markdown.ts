import MarkdownIt, { type Token } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import taskLists from 'markdown-it-task-lists';
import { DEFAULT_PALETTE, type Palette } from '../shared/types.js';
import { stripMetaAndBase } from './html-tags.js';
import { mathPlugin } from './math.js';
import { highlightCode } from './shiki.js';

export interface RenderResult {
  html: string;
  tokens: Token[];
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
  highlight: () => '',
});

// markdown-it 15 turned fuzzy links off; bare `example.com` and `www.` hosts
// linked before, and readers of existing documents expect that to continue.
md.linkify.set({ fuzzyLink: true });

md.use(anchor, {
  slugify: (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^\wÀ-ɏ\s-]/g, '')
      .replace(/\s+/g, '-'),
});
md.use(taskLists, { enabled: false, label: false });
md.use(mathPlugin);

export async function renderMarkdown(
  source: string,
  bodyStartLine = 0,
  palette: Palette = DEFAULT_PALETTE,
): Promise<RenderResult> {
  const tokens = md.parse(source, {});
  for (const token of tokens) {
    // Tag headings with their FILE line (0-based) so the editor↔preview sync
    // can map a DOM heading back to the source cursor position.
    if (token.type === 'heading_open' && token.map) {
      token.attrSet('data-source-line', String(token.map[0] + bodyStartLine));
    }
    // A <meta http-equiv="refresh"> in a document navigates the whole tab once
    // the client inserts it, and no CSP directive covers that. <base> would
    // retarget every relative link. Raw HTML tokens are the only place either
    // can come from: markdown-it escapes `<` everywhere else.
    if (token.type === 'html_block') {
      token.content = stripMetaAndBase(token.content);
    } else if (token.type === 'inline' && token.children) {
      for (const child of token.children) {
        if (child.type === 'html_inline') child.content = stripMetaAndBase(child.content);
      }
    } else if (token.type === 'fence') {
      const lang = token.info.trim().split(/\s+/)[0] || 'text';
      if (lang === 'mermaid') {
        token.type = 'html_block';
        token.content =
          `<div class="mermaid-block" data-source="${encodeURIComponent(token.content)}"></div>\n`;
      } else {
        const highlighted = await highlightCode(token.content, lang, palette);
        token.type = 'html_block';
        token.content = highlighted + '\n';
      }
    }
  }
  const html = md.renderer.render(tokens, md.options, {});
  return { html, tokens };
}
