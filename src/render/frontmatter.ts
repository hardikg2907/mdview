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
    // CRLF-safe strip so the body and the bodyStartLine offset stay aligned for
    // both LF- and CRLF-authored sources.
    const body = parsed.content.replace(/^(?:\r?\n)+/, '');
    const bodyStartLine = computeBodyStartLine(raw);
    return {
      data: parsed.data ?? null,
      body,
      bodyStartLine,
    };
  } catch {
    return { data: null, body: raw, bodyStartLine: 0 };
  }
}

// Computed directly from `raw` so it does not depend on gray-matter's internal
// byte representation (avoids string-equality coincidences and CRLF normalization
// surprises). Locates the closing '---' delimiter and skips any blank lines we
// remove from `body` above, so file-line and body-line stay consistent.
function computeBodyStartLine(raw: string): number {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== '---') return 0;
  let closingIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      closingIdx = i;
      break;
    }
  }
  if (closingIdx < 0) return 0;
  let bodyLine = closingIdx + 1;
  while (bodyLine < lines.length && lines[bodyLine] === '') {
    bodyLine++;
  }
  return bodyLine;
}
