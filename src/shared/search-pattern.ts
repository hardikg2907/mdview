export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export const DEFAULT_OPTIONS: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

export interface CompiledPattern {
  test(text: string): RegExpExecArray | null;
  /** Returns all matches in `text`, with `index` and matched length. */
  matchAll(text: string): Array<{ index: number; length: number }>;
  /**
   * Like matchAll, but stops once wall-clock exceeds `budgetMs`. ReDoS guard
   * for the server-side folder search where the user can pass an arbitrary
   * regex. Returns `truncated: true` when the budget was hit mid-line.
   */
  matchAllWithBudget(
    text: string,
    budgetMs: number,
  ): { matches: Array<{ index: number; length: number }>; truncated: boolean };
  /** Original query (for empty-check). */
  query: string;
  /** Was the regex valid (for regex mode)? */
  valid: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile a search query + options into a pattern usable for both doc and
 * folder search. If `regex: true` and the query is invalid, `valid: false` is
 * returned (callers should display a warning).
 */
export function compilePattern(query: string, opts: SearchOptions): CompiledPattern {
  if (!query) {
    return {
      test: () => null,
      matchAll: () => [],
      matchAllWithBudget: () => ({ matches: [], truncated: false }),
      query,
      valid: true,
    };
  }
  let re: RegExp;
  if (opts.regex) {
    try {
      re = new RegExp(query, opts.caseSensitive ? 'g' : 'gi');
    } catch {
      return {
        test: () => null,
        matchAll: () => [],
        matchAllWithBudget: () => ({ matches: [], truncated: false }),
        query,
        valid: false,
      };
    }
  } else {
    let pat = escapeRegex(query);
    if (opts.wholeWord) pat = `\\b${pat}\\b`;
    re = new RegExp(pat, opts.caseSensitive ? 'g' : 'gi');
  }
  return {
    query,
    valid: true,
    test(text) {
      re.lastIndex = 0;
      return re.exec(text);
    },
    matchAll(text) {
      re.lastIndex = 0;
      const out: Array<{ index: number; length: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          // Avoid zero-width regex infinite loop
          re.lastIndex++;
          continue;
        }
        out.push({ index: m.index, length: m[0].length });
      }
      return out;
    },
    matchAllWithBudget(text, budgetMs) {
      re.lastIndex = 0;
      const matches: Array<{ index: number; length: number }> = [];
      const deadline = performance.now() + budgetMs;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        matches.push({ index: m.index, length: m[0].length });
        if (performance.now() > deadline) {
          return { matches, truncated: true };
        }
      }
      return { matches, truncated: false };
    },
  };
}
