import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { parseFrontmatter } from '../../render/frontmatter.js';
import { compilePattern, type SearchOptions } from '../../shared/search-pattern.js';
import { flattenMdRelPaths } from '../../shared/tree-utils.js';
import { Limiter, LimiterAbortError } from './limiter.js';
import {
  openRegexSession,
  RegexAbortError,
  type RegexSession,
  RegexTimeoutError,
} from './regex-runner.js';
import type { FileMatches } from './regex-worker.js';
import { MAX_MARKDOWN_BYTES, resolveSafePath } from './resolve.js';
import { walkFolder } from './tree.js';

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
  /**
   * A regex search hit its time budget and stopped early. `results` holds what
   * was found before that, and `truncated` is set too.
   */
  timedOut: boolean;
}

interface GrepOptions extends Partial<SearchOptions> {
  perFileCap?: number;
  globalCap?: number;
  snippetRadius?: number;
  /** Wall-clock time a regex search may spend matching (defaults 3,000 ms). */
  regexBudgetMs?: number;
  /**
   * Main-thread time a literal search may spend matching (defaults 1,000 ms).
   * Running out ends the search with `truncated` set; it is not a timeout.
   */
  literalBudgetMs?: number;
  /** Skip lines longer than this, in both modes (defaults 10,000). */
  maxLineLen?: number;
  /** Directory basenames to skip while walking. Forwarded to walkFolder. */
  ignore?: ReadonlySet<string>;
  /** Reuses file bodies across searches. */
  cache?: ContentCache;
  /** Stops the search when the client goes away. */
  signal?: AbortSignal;
}

/** Files one search reads at once. Enough to hide disk latency without a burst of open fds. */
const READ_CONCURRENCY = 8;
/**
 * A literal search hands the thread back after this much matching, so one big
 * file cannot hold up every other request, and an abort lands within a slice.
 */
const LITERAL_SLICE_MS = 10;
/** Lines plus hits matched between clock reads. A line under the cap holds at most 10,000 hits. */
const LITERAL_CHECK_STEPS = 4096;

// Any page the user has open can fire searches with <img> tags, each on its own
// connection, so every folder search (literal or regex) runs under one of these
// two slots and the rest queue. Bodies read from disk are charged to a byte
// budget shared by all searches, so memory in flight does not grow with the
// number of searches. It fits the largest readable file once per slot.
export const searchSlots = new Limiter(2);
export const searchReadBudget = new Limiter(2 * MAX_MARKDOWN_BYTES);

/** A regex batch closes at this many files or this many characters. */
const BATCH_FILES = 64;
const BATCH_CHARS = 1_000_000;

/**
 * Front-matter-stripped markdown bodies keyed by path, valid while the file's
 * mtime and size are unchanged. The watcher also invalidates entries, which
 * catches an edit that lands within the filesystem's mtime resolution.
 * Least-recently-used entries go first once the total passes `maxChars`.
 */
export class ContentCache {
  private readonly entries = new Map<string, { mtimeMs: number; size: number; body: string }>();
  private readonly maxChars: number;
  private chars = 0;

  constructor(maxChars = 32 * 1024 * 1024) {
    this.maxChars = maxChars;
  }

  get(key: string, mtimeMs: number, size: number): string | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.mtimeMs !== mtimeMs || e.size !== size) {
      this.invalidate(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, e);
    return e.body;
  }

  set(key: string, mtimeMs: number, size: number, body: string): void {
    this.invalidate(key);
    if (body.length > this.maxChars / 4) return;
    this.entries.set(key, { mtimeMs, size, body });
    this.chars += body.length;
    for (const [oldKey] of this.entries) {
      if (this.chars <= this.maxChars) break;
      this.invalidate(oldKey);
    }
  }

  invalidate(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.chars -= e.body.length;
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.chars = 0;
  }

  /** The key a root-relative path is cached under. Shared with the watcher hook. */
  static keyFor(rootAbsPath: string, relPath: string): string {
    return path.join(rootAbsPath, relPath);
  }
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

/** Where a line starts: its 0-based index and its offset in the body. */
interface LinePos {
  index: number;
  start: number;
}

/**
 * Visit each line of `body` as `[start, end)` offsets, split on LF and CRLF the
 * way `split(/\r?\n/)` would. A 16 MB body of short lines would otherwise
 * become millions of strings at once. Stops when `visit` returns false, and
 * returns where the next line starts so a later call can resume there, or null
 * once the last line has been visited.
 */
function eachLine(
  body: string,
  visit: (index: number, start: number, end: number) => boolean,
  from: LinePos = { index: 0, start: 0 },
): LinePos | null {
  let start = from.start;
  for (let index = from.index; ; index++) {
    const nl = body.indexOf('\n', start);
    if (nl < 0) {
      visit(index, start, body.length);
      return null;
    }
    const end = nl > start && body.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
    const more = visit(index, start, end);
    start = nl + 1;
    if (!more) return { index: index + 1, start };
  }
}

/** The text of each line in `wanted` (ascending, repeats allowed). */
function linesAt(body: string, wanted: readonly number[]): Map<number, string> {
  const out = new Map<number, string>();
  let w = 0;
  if (wanted.length === 0) return out;
  eachLine(body, (index, start, end) => {
    if (wanted[w] === index) out.set(index, body.slice(start, end));
    while (wanted[w] === index) w++;
    return w < wanted.length;
  });
  return out;
}

/** One folder to search, plus the root id its results should be reported under. */
export interface GrepRoot {
  absPath: string;
  id: string;
  ignore?: ReadonlySet<string>;
}

interface Target {
  root: GrepRoot;
  realRoot: string;
  relPath: string;
}

/** A body ready to match, and the read budget it holds until the matcher is done with it. */
interface Loaded {
  body: string | null;
  release: () => void;
}

const HOLDS_NOTHING = (): void => undefined;

/**
 * A file's place in its search's queue for read budget. `prev` settles once
 * every earlier file has queued (or needed no budget); `pass` lets the next
 * file queue.
 */
interface Turn {
  prev: Promise<void>;
  pass: () => void;
}

async function loadBody(
  t: Target,
  cache: ContentCache,
  signal: AbortSignal,
  turn: Turn,
): Promise<Loaded> {
  let release = HOLDS_NOTHING;
  let passed = false;
  try {
    const abs = await resolveSafePath(t.root.absPath, t.relPath, { realRoot: t.realRoot });
    const st = await stat(abs);
    if (!st.isFile() || st.size > MAX_MARKDOWN_BYTES) return { body: null, release };
    const key = ContentCache.keyFor(t.root.absPath, t.relPath);
    const cached = cache.get(key, st.mtimeMs, st.size);
    // Already in memory, so it costs the budget nothing.
    if (cached !== undefined) return { body: cached, release };
    // Files queue for budget in walk order, the order the consumer takes them.
    // Queued in the order their stats finish instead, later files could hold
    // the budget while the one the consumer waits on never fits.
    await turn.prev;
    const granted = searchReadBudget.acquire(st.size, signal);
    passed = true;
    turn.pass();
    release = await granted;
    const { body } = parseFrontmatter(await readFile(abs, 'utf8'));
    cache.set(key, st.mtimeMs, st.size, body);
    return { body, release };
  } catch {
    // Vanished, unreadable, a link out of the root, or the search stopped
    // while this read waited for budget: not searchable.
    release();
    return { body: null, release: HOLDS_NOTHING };
  } finally {
    if (!passed) void turn.prev.then(turn.pass);
  }
}

/**
 * Yield each target with its body, in order, while keeping up to `concurrency`
 * reads in flight ahead of the consumer. The consumer releases each body it
 * receives.
 */
async function* readAhead(
  targets: readonly Target[],
  cache: ContentCache,
  concurrency: number,
  signal: AbortSignal,
): AsyncGenerator<[Target, Loaded]> {
  const inflight: Array<Promise<Loaded>> = [];
  let next = 0;
  let queued: Promise<void> = Promise.resolve();
  const fill = (): void => {
    while (inflight.length < concurrency && next < targets.length) {
      const prev = queued;
      let pass = HOLDS_NOTHING;
      queued = new Promise<void>((resolve) => {
        pass = resolve;
      });
      inflight.push(loadBody(targets[next++] as Target, cache, signal, { prev, pass }));
    }
  };
  try {
    fill();
    for (const t of targets) {
      const loaded = await (inflight.shift() as Promise<Loaded>);
      fill();
      yield [t, loaded];
    }
  } finally {
    // The consumer can stop early, and reads it never received still hold budget.
    for (const pending of inflight) void pending.then((l) => l.release());
  }
}

async function collectTargets(roots: readonly GrepRoot[], opts: GrepOptions): Promise<Target[]> {
  const out: Target[] = [];
  for (const root of roots) {
    let realRoot: string;
    try {
      realRoot = await realpath(root.absPath);
    } catch {
      continue;
    }
    // Walk unprefixed so paths stay resolvable against this root, then prefix
    // on the way out.
    const tree = await walkFolder(root.absPath, { ignore: root.ignore ?? opts.ignore });
    for (const relPath of flattenMdRelPaths(tree)) out.push({ root, realRoot, relPath });
  }
  return out;
}

export async function grepFiles(
  roots: readonly GrepRoot[],
  query: string,
  opts: GrepOptions = {},
): Promise<FolderSearchResults> {
  const perFileCap = opts.perFileCap ?? 20;
  const globalCap = opts.globalCap ?? 200;
  const snippetRadius = opts.snippetRadius ?? 60;
  const maxLineLen = opts.maxLineLen ?? 10_000;
  const regexMode = opts.regex ?? false;
  const cache = opts.cache ?? new ContentCache();
  const signal = opts.signal;

  const empty: FolderSearchResults = { query, results: [], truncated: false, timedOut: false };
  if (!query) return empty;
  const pattern = compilePattern(query, {
    caseSensitive: opts.caseSensitive ?? false,
    wholeWord: opts.wholeWord ?? false,
    regex: regexMode,
  });
  if (!pattern.valid) return empty;

  const results: FileSearchResult[] = [];
  let totalHits = 0;
  let truncated = false;
  let timedOut = false;

  // globalCap is a budget for the whole search, not per root — it exists to
  // bound the work and the response, and both are workspace-wide.
  const record = (t: Target, body: string, m: FileMatches): void => {
    // A skipped line may hold matches, so the search as a whole is incomplete
    // even when this file reports none.
    if (m.skipped) truncated = true;
    if (m.total === 0) return;
    const lines = linesAt(body, m.hits.map(([lineIdx]) => lineIdx));
    const hits: SearchHit[] = [];
    let fileTruncated = m.skipped || m.total > m.hits.length;
    for (const [lineIdx, col, len] of m.hits) {
      if (totalHits >= globalCap) {
        truncated = true;
        fileTruncated = true;
        break;
      }
      const { snippet, highlight } = buildSnippet(
        lines.get(lineIdx) ?? '', col, col + len, snippetRadius,
      );
      hits.push({ line: lineIdx + 1, col, snippet, highlight });
      totalHits++;
    }
    if (totalHits >= globalCap) truncated = true;
    if (hits.length > 0) {
      results.push({
        relPath: `${t.root.id}/${t.relPath}`,
        hits,
        total: m.total,
        truncated: fileTruncated,
      });
    }
  };

  // Literal queries are escaped before they become a regex, so they cannot
  // backtrack and stay on this thread. They still get the line cap and a budget
  // of matching time: one 15 MB line of `a` holds 15 million hits for `q=a`, and
  // any page the user has open can ask for that search with an <img> tag. Hits
  // past the per-file cap are counted, never stored. Only time spent matching
  // is charged, so searches taking turns on the thread do not spend each
  // other's budget.
  const literalRe = regexMode ? null : new RegExp(pattern.source, pattern.flags);
  let literalLeftMs = opts.literalBudgetMs ?? 1_000;
  let sliceMs = 0;
  let clock = 0;
  let steps = 0;
  const charge = (): void => {
    const now = performance.now();
    literalLeftMs -= now - clock;
    sliceMs += now - clock;
    clock = now;
  };
  // Called every LITERAL_CHECK_STEPS: reading the clock on every line and hit
  // would cost more than the matching.
  const checkpoint = async (): Promise<'time' | 'abort' | null> => {
    steps = 0;
    charge();
    if (literalLeftMs <= 0) return 'time';
    if (sliceMs < LITERAL_SLICE_MS) return null;
    sliceMs = 0;
    await yieldToEventLoop();
    clock = performance.now();
    return stop.signal.aborted ? 'abort' : null;
  };
  const matchLiteral = async (
    re: RegExp,
    body: string,
  ): Promise<{ m: FileMatches; stopped: 'time' | 'abort' | null }> => {
    const out: FileMatches = { total: 0, hits: [], skipped: false };
    let stopped: 'time' | 'abort' | null = null;
    clock = performance.now();
    const visit = (index: number, start: number, end: number): boolean => {
      if (end - start > maxLineLen) {
        out.skipped = true;
      } else {
        const line = body.slice(start, end);
        re.lastIndex = 0;
        for (let m = re.exec(line); m !== null; m = re.exec(line)) {
          out.total++;
          steps++;
          if (out.hits.length < perFileCap) out.hits.push([index, m.index, m[0].length]);
        }
      }
      return ++steps < LITERAL_CHECK_STEPS;
    };
    for (let at = eachLine(body, visit); at !== null; at = eachLine(body, visit, at)) {
      stopped = await checkpoint();
      if (stopped) break;
    }
    charge();
    if (stopped === 'time') out.skipped = true;
    return { m: out, stopped };
  };

  // Mirrors the caller's signal, and also fires when this search ends for any
  // reason, so reads still queued for budget give up their place.
  const stop = new AbortController();
  const onCallerAbort = (): void => stop.abort();
  if (signal?.aborted) stop.abort();
  signal?.addEventListener('abort', onCallerAbort, { once: true });

  let releaseSlot: () => void;
  try {
    releaseSlot = await searchSlots.acquire(1, stop.signal);
  } catch (err) {
    signal?.removeEventListener('abort', onCallerAbort);
    if (err instanceof LimiterAbortError) return empty;
    throw err;
  }

  let session: RegexSession | null = null;
  let batch: Array<[Target, string, () => void]> = [];
  let batchChars = 0;
  const flush = async (): Promise<void> => {
    if (!session || batch.length === 0) return;
    const pending = batch;
    batch = [];
    batchChars = 0;
    try {
      const matches = await session.match(pending.map(([, body]) => body));
      for (let i = 0; i < pending.length && totalHits < globalCap; i++) {
        const [t, body] = pending[i] as [Target, string, () => void];
        record(t, body, matches[i] as FileMatches);
      }
    } finally {
      for (const [, , release] of pending) release();
    }
  };

  try {
    const targets = await collectTargets(roots, opts);

    // A user-supplied regex never runs on this thread: one exec() can backtrack
    // for minutes, and nothing interrupts it short of ending the thread it runs
    // on. The worker is terminated once the search's budget is spent.
    session = regexMode
      ? openRegexSession({
          source: pattern.source,
          flags: pattern.flags,
          maxLineLen,
          perFileCap,
          budgetMs: opts.regexBudgetMs ?? 3_000,
          signal: stop.signal,
        })
      : null;

    for await (const [t, { body, release }] of readAhead(
      targets,
      cache,
      READ_CONCURRENCY,
      stop.signal,
    )) {
      if (stop.signal.aborted || totalHits >= globalCap) {
        release();
        break;
      }
      if (body === null) continue;
      if (literalRe) {
        let stopped: 'time' | 'abort' | null;
        try {
          const res = await matchLiteral(literalRe, body);
          stopped = res.stopped;
          record(t, body, res.m);
        } finally {
          release();
        }
        if (stopped === 'time') truncated = true;
        if (stopped) break;
        continue;
      }
      batch.push([t, body, release]);
      batchChars += body.length;
      if (batch.length >= BATCH_FILES || batchChars >= BATCH_CHARS) await flush();
    }
    if (!stop.signal.aborted && totalHits < globalCap) await flush();
  } catch (err) {
    if (err instanceof RegexTimeoutError) {
      timedOut = true;
      truncated = true;
    } else if (!(err instanceof RegexAbortError)) {
      throw err;
    }
  } finally {
    stop.abort();
    signal?.removeEventListener('abort', onCallerAbort);
    for (const [, , release] of batch) release();
    session?.release();
    releaseSlot();
  }
  if (totalHits >= globalCap) truncated = true;
  return { query, results, truncated, timedOut };
}
