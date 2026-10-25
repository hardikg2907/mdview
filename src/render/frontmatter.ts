import { CORE_SCHEMA, load, mergeTag } from 'js-yaml';

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

// YAML 1.2 dropped merge keys, but front matter written for YAML 1.1 tools
// (`<<: *defaults`) relies on them. The budgets above still bound what a merge
// can expand to.
const SCHEMA = CORE_SCHEMA.withTags(mergeTag);

function unparsed(raw: string): FrontmatterResult {
  return { data: null, body: raw, bodyStartLine: 0 };
}

export function parseFrontmatter(raw: string): FrontmatterResult {
  const block = locateBlock(raw);
  if (!block) return unparsed(raw);

  let loaded: unknown = {};
  // `load` throws on an empty or comment-only source, but such a block is
  // still front matter with no keys.
  if (!isBlank(block.yaml)) {
    try {
      loaded = load(block.yaml, { schema: SCHEMA });
    } catch {
      return unparsed(raw);
    }
    if (!withinBudget(loaded)) return unparsed(raw);
  }

  return {
    data: isPlainObject(loaded) ? loaded : null,
    // CRLF-safe strip so the body and the bodyStartLine offset stay aligned for
    // both LF- and CRLF-authored sources.
    body: block.body.replace(/^(?:\r?\n)+/, ''),
    bodyStartLine: block.bodyStartLine,
  };
}

// Front matter is only a literal `---` first line plus a literal `---` closing
// line. Any other opening (`---js`, `---yaml`, a BOM) is body text, so no
// language hint can select a different parser.
//
// Lines are walked by offset rather than split up front: splitting a 16 MB
// body of short lines allocates millions of strings, hundreds of MB, on every
// render and every search of the file.
function locateBlock(
  raw: string,
): { yaml: string; body: string; bodyStartLine: number } | null {
  if (!isFenceLine(raw, 0)) return null;
  let next = nextLineStart(raw, 0);
  const yamlStart = next;
  let closingIdx = -1;
  let closingStart = -1;
  for (let i = 1; next >= 0; i++) {
    if (isFenceLine(raw, next)) {
      closingIdx = i;
      closingStart = next;
      break;
    }
    next = nextLineStart(raw, next);
  }
  if (closingIdx < 0) return null;

  // The body is a verbatim slice of `raw`, CRLF included.
  const bodyStart = nextLineStart(raw, closingStart);
  let bodyStartLine = closingIdx + 1;
  for (let at = bodyStart; at >= 0 && lineEnd(raw, at) === at; at = nextLineStart(raw, at)) {
    bodyStartLine++;
  }
  return {
    yaml: raw
      .slice(yamlStart, closingStart)
      .replace(/\r?\n$/, '')
      .replace(/\r\n/g, '\n'),
    body: bodyStart < 0 ? '' : raw.slice(bodyStart),
    bodyStartLine,
  };
}

/** End of the line starting at `start`, before its LF or CRLF. */
function lineEnd(raw: string, start: number): number {
  const nl = raw.indexOf('\n', start);
  if (nl < 0) return raw.length;
  return nl > start && raw.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
}

/** Start of the line after the one at `start`, or -1 if that line is the last. */
function nextLineStart(raw: string, start: number): number {
  const nl = raw.indexOf('\n', start);
  return nl < 0 ? -1 : nl + 1;
}

function isFenceLine(raw: string, start: number): boolean {
  return lineEnd(raw, start) - start === 3 && raw.startsWith('---', start);
}

function isBlank(yaml: string): boolean {
  return yaml.split(/\r?\n/).every((line) => /^\s*(?:#.*)?$/.test(line));
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
