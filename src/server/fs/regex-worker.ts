// Runs folder-search regexes off the main thread. A user-supplied pattern can
// backtrack for minutes inside a single exec() call, and nothing can interrupt
// that call except terminating the thread running it.
//
// This file is loaded on its own as a worker entry — bundled to
// bin/regex-worker.mjs, and run straight from source under the test runner —
// so it must not import anything but Node built-ins.
import { parentPort } from 'node:worker_threads';

export interface MatchRequest {
  id: number;
  source: string;
  flags: string;
  /** Lines longer than this are skipped rather than matched. */
  maxLineLen: number;
  /** Match positions kept per file; the rest are only counted. */
  perFileCap: number;
  /** Markdown bodies, one per file. */
  files: string[];
}

export interface FileMatches {
  total: number;
  /** `[lineIndex, column, length]`, at most `perFileCap` of them. */
  hits: Array<[number, number, number]>;
  /** A line was skipped for length, so `total` may be low. */
  skipped: boolean;
}

export type MatchResponse =
  | { id: number; ok: true; files: FileMatches[] }
  | { id: number; ok: false };

let compiled: { key: string; re: RegExp } | null = null;

function regexFor(source: string, flags: string): RegExp {
  const key = `${flags}/${source}`;
  if (compiled?.key !== key) compiled = { key, re: new RegExp(source, flags) };
  return compiled.re;
}

function matchFile(re: RegExp, text: string, maxLineLen: number, cap: number): FileMatches {
  const out: FileMatches = { total: 0, hits: [], skipped: false };
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.length > maxLineLen) {
      out.skipped = true;
      continue;
    }
    re.lastIndex = 0;
    let m: RegExpExecArray | null = re.exec(line);
    while (m !== null) {
      if (m[0].length === 0) {
        // A zero-width match would otherwise repeat at the same index forever.
        re.lastIndex++;
      } else {
        out.total++;
        if (out.hits.length < cap) out.hits.push([i, m.index, m[0].length]);
      }
      m = re.exec(line);
    }
  }
  return out;
}

parentPort?.on('message', (req: MatchRequest) => {
  let res: MatchResponse;
  try {
    const re = regexFor(req.source, req.flags);
    res = {
      id: req.id,
      ok: true,
      files: req.files.map((f) => matchFile(re, f, req.maxLineLen, req.perFileCap)),
    };
  } catch {
    res = { id: req.id, ok: false };
  }
  parentPort?.postMessage(res);
});
