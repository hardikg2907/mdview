import matter from 'gray-matter';

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

export function parseFrontmatter(raw: string): FrontmatterResult {
  if (!raw.startsWith('---')) {
    return { data: null, body: raw, bodyStartLine: 0 };
  }
  try {
    const parsed = matter(raw);
    const body = parsed.content.replace(/^\n+/, '');
    const bodyStartLine = computeBodyStartLine(raw, body);
    return {
      data: parsed.data ?? null,
      body,
      bodyStartLine,
    };
  } catch {
    return { data: null, body: raw, bodyStartLine: 0 };
  }
}

function computeBodyStartLine(raw: string, body: string): number {
  if (body.length === 0) {
    return countNewlines(raw);
  }
  const idx = raw.lastIndexOf(body);
  if (idx < 0) {
    return 0;
  }
  return countNewlines(raw.slice(0, idx));
}

function countNewlines(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) count++;
  }
  return count;
}
