import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import taskLists from 'markdown-it-task-lists';
import { mathPlugin } from './math.js';
import { highlightCode } from './shiki.js';

export interface RenderResult {
  html: string;
  tokens: ReturnType<MarkdownIt['parse']>;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
  highlight: () => '',
});

md.use(anchor, {
  permalink: false,
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
): Promise<RenderResult> {
  const tokens = md.parse(source, {});
  for (const token of tokens) {
    // Tag headings with their FILE line (0-based) so the editor↔preview sync
    // can map a DOM heading back to the source cursor position.
    if (token.type === 'heading_open' && token.map) {
      token.attrSet('data-source-line', String(token.map[0] + bodyStartLine));
    }
    if (token.type === 'fence') {
      const lang = token.info.trim().split(/\s+/)[0] || 'text';
      if (lang === 'mermaid') {
        token.type = 'html_block';
        token.content =
          `<div class="mermaid-block" data-source="${encodeURIComponent(token.content)}"></div>\n`;
      } else {
        const highlighted = await highlightCode(token.content, lang);
        token.type = 'html_block';
        token.content = highlighted + '\n';
      }
    }
  }
  const html = md.renderer.render(tokens, md.options, {});
  return { html, tokens };
}
