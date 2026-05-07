import type { SearchOptions } from '../../shared/search-pattern.js';

export interface FolderSearchHit {
  line: number;
  col: number;
  snippet: string;
  highlight: [number, number];
}

export interface FolderSearchFile {
  relPath: string;
  hits: FolderSearchHit[];
  total: number;
  truncated: boolean;
}

export interface FolderSearchResults {
  query: string;
  results: FolderSearchFile[];
  truncated: boolean;
}

export async function fetchFolderSearch(
  query: string,
  opts: SearchOptions,
  signal?: AbortSignal,
): Promise<FolderSearchResults> {
  const params = new URLSearchParams({ q: query });
  if (opts.caseSensitive) params.set('case', '1');
  if (opts.wholeWord) params.set('word', '1');
  if (opts.regex) params.set('regex', '1');
  const res = await fetch(`/api/search?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as FolderSearchResults;
}
