import MarkdownItFactory, { type MarkdownIt, type Token } from 'markdown-it';
import { DEFAULT_PALETTE, type Palette } from '../shared/types.js';
import { stripMetaAndBase } from './html-tags.js';
import { mathPlugin } from './math.js';
import { highlightCode } from './shiki.js';

export interface RenderResult {
  html: string;
  tokens: Token[];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\wÀ-ɏ\s-]/g, '')
    .replace(/\s+/g, '-');
}

function headingText(children: readonly Token[] | null): string {
  if (!children) return '';
  let out = '';
  for (const child of children) {
    if (child.type === 'text' || child.type === 'code_inline') out += child.content;
  }
  return out;
}

// Replaces markdown-it-anchor, which called tokens.indexOf(token) on every
// heading (quadratic on many headings), rescanned suffixes from 1 on repeated
// titles, and tracked slugs in a plain object where `__proto__` collided.
function headingAnchorsPlugin(instance: MarkdownIt): void {
  instance.core.ruler.push('mdview-heading-anchors', (state) => {
    const seen = new Set<string>();
    const nextSuffix = new Map<string, number>();
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (token.type !== 'heading_open') continue;
      const existing = token.attrGet('id');
      const base =
        existing !== null ? String(existing) : slugify(headingText(tokens[i + 1]?.children ?? null));
      let slug = base;
      if (seen.has(slug)) {
        let n = nextSuffix.get(base) ?? 1;
        while (seen.has(`${base}-${n}`)) n++;
        slug = `${base}-${n}`;
        nextSuffix.set(base, n + 1);
      }
      seen.add(slug);
      token.attrSet('id', slug);
      token.attrSet('tabindex', '-1');
    }
  });
}

// Replaces markdown-it-task-lists, whose parentToken() walked backwards to
// token 0 on every checkbox item — turning 1 MB of `- [ ] a` into tens of
// billions of iterations on the main thread.
function taskListsPlugin(instance: MarkdownIt): void {
  instance.core.ruler.after('inline', 'mdview-task-lists', (state) => {
    const tokens = state.tokens;
    const openLists: Token[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        openLists.push(token);
        continue;
      }
      if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
        openLists.pop();
        continue;
      }
      if (
        i < 2 ||
        token.type !== 'inline' ||
        tokens[i - 1]?.type !== 'paragraph_open' ||
        tokens[i - 2]?.type !== 'list_item_open'
      ) {
        continue;
      }
      const firstChild = token.children?.[0];
      if (!firstChild || firstChild.type !== 'text') continue;
      const prefix = firstChild.content.slice(0, 4);
      if (prefix !== '[ ] ' && prefix !== '[x] ' && prefix !== '[X] ') continue;

      const checked = prefix !== '[ ] ';
      const checkbox = new state.Token('html_inline', '', 0);
      checkbox.content = checked
        ? '<input class="task-list-item-checkbox" checked="" disabled="" type="checkbox">'
        : '<input class="task-list-item-checkbox" disabled="" type="checkbox">';
      token.children!.unshift(checkbox);
      firstChild.content = firstChild.content.slice(3);
      token.content = token.content.slice(3);

      tokens[i - 2]!.attrSet('class', 'task-list-item');
      openLists[openLists.length - 1]?.attrSet('class', 'contains-task-list');
    }
  });
}

const md = new MarkdownItFactory({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
  highlight: () => '',
});

// markdown-it 15 turned fuzzy links off; bare `example.com` and `www.` hosts
// linked before, and readers of existing documents expect that to continue.
md.linkify.set({ fuzzyLink: true });

md.use(headingAnchorsPlugin);
md.use(taskListsPlugin);
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
    // <meta http-equiv="refresh"> navigates the whole tab on insertion (no CSP
    // directive covers it), <base> retargets relative links, and <link> resource
    // hints (dns-prefetch, preconnect) initiate outbound connections past
    // default-src/connect-src. Raw HTML tokens are the only place any of these
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
