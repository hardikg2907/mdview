import type Token from 'markdown-it/lib/token.mjs';
import type { OutlineNode, HeadingLevel } from '../shared/types.js';

export function extractOutline(tokens: Token[]): OutlineNode[] {
  const flat: OutlineNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type !== 'heading_open') continue;
    const level = Number(t.tag.slice(1)) as HeadingLevel;
    const inline = tokens[i + 1];
    const id = (t.attrGet('id') ?? '').toString();
    const text = inline?.content?.trim() ?? '';
    if (!id || !text) continue;
    flat.push({ id, text, level, children: [] });
  }
  return nest(flat);
}

function nest(flat: OutlineNode[]): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const node of flat) {
    while (stack.length && stack[stack.length - 1]!.level >= node.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1]!.children.push(node);
    }
    stack.push(node);
  }
  return root;
}
