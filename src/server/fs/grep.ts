import { readFile } from 'node:fs/promises';
import { walkFolder } from './tree.js';
import { resolveSafePath } from './resolve.js';
import { parseFrontmatter } from '../../render/frontmatter.js';
import { compilePattern, type SearchOptions } from '../../shared/search-pattern.js';
import { flattenMdRelPaths } from '../../shared/tree-utils.js';

export interface SearchHit {
  /** 1-indexed line number in the markdown body (after frontmatter strip). */
  line: number;
  /** 0-indexed column where the match starts within the original line. */
  col: number;
  /** A snippet around the match, with the matched text intact. */
  snippet: string;
  /** Position of the match within `snippet` (start, end). */
  highlight: [number, number];
}

export interface FileSearchResult {
  relPath: string;
  hits: SearchHit[];
  truncated: boolean;
  total: number;
}

export interface FolderSearchResults {
  query: string;
  results: FileSearchResult[];
  truncated: boolean;
}

interface GrepOptions extends Partial<SearchOptions> {
  perFileCap?: number;
  globalCap?: number;
  snippetRadius?: number;
}

function buildSnippet(line: string, start: number, end: number, radius: number): {
  snippet: string;
  highlight: [number, number];
} {
  const from = Math.max(0, start - radius);
  const to = Math.min(line.length, end + radius);
  const prefix = from > 0 ? '…' : '';
  const suffix = to < line.length ? '…' : '';
  const sliced = line.slice(from, to);
  const hlStart = prefix.length + (start - from);
  const hlEnd = hlStart + (end - start);
  return {
    snippet: prefix + sliced + suffix,
    highlight: [hlStart, hlEnd],
  };
}

export async function grepFiles(
  rootAbsPath: string,
  query: string,
  opts: GrepOptions = {},
): Promise<FolderSearchResults> {
  const perFileCap = opts.perFileCap ?? 20;
  const globalCap = opts.globalCap ?? 200;
  const snippetRadius = opts.snippetRadius ?? 60;

  if (!query || query.length === 0) {
    return { query, results: [], truncated: false };
  }
  const pattern = compilePattern(query, {
    caseSensitive: opts.caseSensitive ?? false,
    wholeWord: opts.wholeWord ?? false,
    regex: opts.regex ?? false,
  });
  if (!pattern.valid) return { query, results: [], truncated: false };

  const tree = await walkFolder(rootAbsPath);
  const files = flattenMdRelPaths(tree);

  const results: FileSearchResult[] = [];
  let totalHits = 0;
  let truncated = false;

  for (const relPath of files) {
    if (totalHits >= globalCap) {
      truncated = true;
      break;
    }
    let absPath: string;
    try {
      absPath = resolveSafePath(rootAbsPath, relPath);
    } catch {
      continue;
    }

    let raw: string;
    try {
      raw = await readFile(absPath, 'utf8');
    } catch {
      continue;
    }
    const { body } = parseFrontmatter(raw);
    const lines = body.split('\n');

    const fileHits: SearchHit[] = [];
    let fileTotal = 0;
    let fileTruncated = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const m of pattern.matchAll(line)) {
        fileTotal++;
        if (fileHits.length < perFileCap) {
          const { snippet, highlight } = buildSnippet(
            line, m.index, m.index + m.length, snippetRadius,
          );
          fileHits.push({ line: i + 1, col: m.index, snippet, highlight });
          totalHits++;
        } else {
          fileTruncated = true;
        }
        if (totalHits >= globalCap) {
          truncated = true;
          break;
        }
      }
      if (totalHits >= globalCap) break;
    }
    if (fileHits.length > 0) {
      results.push({ relPath, hits: fileHits, total: fileTotal, truncated: fileTruncated });
    }
  }
  return { query, results, truncated };
}
