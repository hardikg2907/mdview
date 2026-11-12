import type { MarkdownIt, Token } from 'markdown-it';

const BLOCK_RE = /^\$\$([\s\S]+?)\$\$$/;
/**
 * Inline match. The content (group 1) must not start or end with whitespace.
 * This rules out prices like `$5.99 plus $1` (split across two `$` runs with
 * whitespace adjacent to the closing `$`). Newlines are not allowed inside.
 */
const INLINE_RE = /\$(?!\s)([^$\n]+?)(?<!\s)\$/g;

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
  // Compact in place rather than splicing per block: splicing shifts the rest
  // of `tokens` on every `$$…$$` paragraph and goes quadratic on math-heavy files.
  let write = 0;
  let read = 0;
  while (read < tokens.length) {
    if (
      read + 2 < tokens.length &&
      tokens[read]!.type === 'paragraph_open' &&
      tokens[read + 1]!.type === 'inline' &&
      tokens[read + 2]!.type === 'paragraph_close'
    ) {
      const trimmed = tokens[read + 1]!.content.trim();
      const m = trimmed.match(BLOCK_RE);
      if (m) {
        const replacement = new (tokens[read]!.constructor as typeof Token)('html_block', '', 0);
        replacement.content = blockMathHtml(m[1]!);
        tokens[write++] = replacement;
        read += 3;
        continue;
      }
    }
    tokens[write++] = tokens[read++]!;
  }
  tokens.length = write;
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
