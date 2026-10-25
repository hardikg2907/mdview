import { load } from 'js-yaml';

export interface FrontmatterResult {
  data: Record<string, unknown> | null;
  body: string;
  // 0-based line number in the original source where the returned `body` begins.
  // 0 when there is no frontmatter; > 0 when frontmatter (and any leading blank
  // lines after the closing `---`) has been stripped. Callers thread this into
  // renderMarkdown so heading tokens can be tagged with their FILE line, not
  // their body-relative line.
  bodyStartLine: number;
}

// Aliases are shared references, so a few hundred bytes of YAML can expand to
// hundreds of MB when serialized, or loop back on themselves. Nodes alone do
// not bound that: a few thousand aliases to one long string stay under the
// node budget, so the characters they would serialize to are counted too.
const MAX_NODES = 10_000;
const MAX_STRING_CHARS = 1_000_000;

function unparsed(raw: string): FrontmatterResult {
  return { data: null, body: raw, bodyStartLine: 0 };
}

export function parseFrontmatter(raw: string): FrontmatterResult {
  const block = locateBlock(raw);
  if (!block) return unparsed(raw);

  let loaded: unknown;
  try {
    loaded = load(block.yaml);
  } catch {
    return unparsed(raw);
  }
  if (!withinBudget(loaded)) return unparsed(raw);

  return {
    // An empty or comment-only block loads as `undefined`; it is still a
    // front matter block with no keys.
    data: loaded === undefined ? {} : isPlainObject(loaded) ? loaded : null,
    // CRLF-safe strip so the body and the bodyStartLine offset stay aligned for
    // both LF- and CRLF-authored sources.
    body: block.body.replace(/^(?:\r?\n)+/, ''),
    bodyStartLine: block.bodyStartLine,
  };
}

// Front matter is only a literal `---` first line plus a literal `---` closing
// line. Any other opening (`---js`, `---yaml`, a BOM) is body text, so no
// language hint can select a different parser.
function locateBlock(
  raw: string,
): { yaml: string; body: string; bodyStartLine: number } | null {
  // Capturing split keeps each line's real terminator, so the body is a
  // verbatim slice of `raw`, CRLF included.
  const parts = raw.split(/(\r?\n)/);
  const lineAt = (i: number): string | undefined => parts[i * 2];
  const lineCount = Math.ceil(parts.length / 2);
  if (lineAt(0) !== '---') return null;
  let closingIdx = -1;
  for (let i = 1; i < lineCount; i++) {
    if (lineAt(i) === '---') {
      closingIdx = i;
      break;
    }
  }
  if (closingIdx < 0) return null;
  let bodyStartLine = closingIdx + 1;
  while (bodyStartLine < lineCount && lineAt(bodyStartLine) === '') {
    bodyStartLine++;
  }
  const yaml: string[] = [];
  for (let i = 1; i < closingIdx; i++) yaml.push(lineAt(i) ?? '');
  return {
    yaml: yaml.join('\n'),
    body: parts.slice((closingIdx + 1) * 2).join(''),
    bodyStartLine,
  };
}

function withinBudget(root: unknown): boolean {
  const stack: unknown[] = [root];
  let visited = 0;
  let chars = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    if (++visited > MAX_NODES) return false;
    if (typeof node === 'string') {
      chars += node.length;
    } else if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
    } else if (isPlainObject(node)) {
      for (const [key, child] of Object.entries(node)) {
        chars += key.length;
        stack.push(child);
      }
    }
    if (chars > MAX_STRING_CHARS) return false;
  }
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
