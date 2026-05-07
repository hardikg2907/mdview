import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

const BLOCK_RE = /^\$\$([\s\S]+?)\$\$$/;
/**
 * Inline match. The content (group 1) must not start or end with whitespace.
 * This rules out prices like `$5.99 plus $1` (split across two `$` runs with
 * whitespace adjacent to the closing `$`). Newlines are not allowed inside.
 */
const INLINE_RE = /\$(?!\s)([^\$\n]+?)(?<!\s)\$/g;

function blockMathHtml(latex: string): string {
  const encoded = encodeURIComponent(latex.trim());
  return `<div class="math-block" data-source="${encoded}"></div>\n`;
}

function inlineMathHtml(latex: string): string {
  const encoded = encodeURIComponent(latex);
  return `<span class="math-inline" data-source="${encoded}"></span>`;
}

/**
 * Replace `$$...$$` paragraph-only blocks with html_block tokens. Walks the
 * top-level token stream and only converts paragraphs whose inline content is
 * a single `$$...$$` span (with no other text).
 */
function convertBlockMath(tokens: Token[]): void {
  for (let i = 0; i < tokens.length - 2; i++) {
    if (
      tokens[i]!.type === 'paragraph_open' &&
      tokens[i + 1]!.type === 'inline' &&
      tokens[i + 2]!.type === 'paragraph_close'
    ) {
      const inline = tokens[i + 1]!;
      const trimmed = inline.content.trim();
      const m = trimmed.match(BLOCK_RE);
      if (m) {
        // Replace the 3 tokens with a single html_block. Mutate in place.
        const replacement = new (tokens[i]!.constructor as typeof Token)(
          'html_block',
          '',
          0,
        );
        replacement.content = blockMathHtml(m[1]!);
        tokens.splice(i, 3, replacement);
      }
    }
  }
}

/**
 * Replace `$...$` runs inside `inline` tokens' children with `html_inline`
 * tokens. Skips children inside `code_inline` (they preserve raw text).
 */
function convertInlineMath(tokens: Token[]): void {
  const TokenCtor = tokens[0]?.constructor as typeof Token | undefined;
  if (!TokenCtor) return;

  for (const top of tokens) {
    if (top.type !== 'inline' || !top.children) continue;
    const out: Token[] = [];
    for (const child of top.children) {
      if (child.type !== 'text') {
        out.push(child);
        continue;
      }
      const text = child.content;
      INLINE_RE.lastIndex = 0;
      let last = 0;
      let m: RegExpExecArray | null;
      let found = false;
      while ((m = INLINE_RE.exec(text)) !== null) {
        found = true;
        if (m.index > last) {
          const t = new TokenCtor('text', '', 0);
          t.content = text.slice(last, m.index);
          out.push(t);
        }
        const mathTok = new TokenCtor('html_inline', '', 0);
        mathTok.content = inlineMathHtml(m[1]!);
        out.push(mathTok);
        last = m.index + m[0].length;
      }
      if (!found) {
        out.push(child);
      } else if (last < text.length) {
        const t = new TokenCtor('text', '', 0);
        t.content = text.slice(last);
        out.push(t);
      }
    }
    top.children = out;
  }
}

/**
 * Markdown-it plugin that emits placeholder elements for `$...$` and `$$...$$`
 * math regions. The actual TeX → HTML rendering happens lazily on the client.
 */
export function mathPlugin(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'mdview-math', (state) => {
    convertBlockMath(state.tokens);
    convertInlineMath(state.tokens);
  });
}
