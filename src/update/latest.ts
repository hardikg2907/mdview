import { isValidVersion } from './semver.js';

/**
 * The one place mdview talks to the network. It sends a bare GET with no
 * identifier of any kind and treats whatever comes back as hostile.
 */
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/@hardikg%2fmdview/dist-tags';
const TIMEOUT_MS = 5_000;
/** A dist-tags answer is a few dozen bytes; anything near this is not one. */
const MAX_BODY_BYTES = 64 * 1024;

/** A failure whose message is safe to show as is: it never echoes the response. */
export class UpdateCheckError extends Error {}

export interface FetchLatestOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

async function readCapped(
  res: Response,
  maxBytes: number,
  abort: AbortController,
): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    abort.abort();
    throw new UpdateCheckError('the registry answer was too large');
  }
  if (!res.body) throw new UpdateCheckError('the registry answer was empty');
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // A server can lie about, or omit, content-length; the stream is what counts.
      abort.abort();
      await reader.cancel().catch(() => undefined);
      throw new UpdateCheckError('the registry answer was too large');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * The latest published version, validated. Rejects with an UpdateCheckError on
 * every failure: timeout, redirect, bad status, oversize, malformed JSON, or a
 * `latest` that is not a plain semver string.
 */
export async function fetchLatestVersion(options: FetchLatestOptions = {}): Promise<string> {
  const fetchFn = options.fetchFn ?? fetch;
  const abort = new AbortController();
  const timeout = AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS);
  const signal = AbortSignal.any([abort.signal, timeout]);

  let body: string;
  try {
    // redirect: 'error' because an answer that points elsewhere is not the one
    // we asked for. Node's fetch keeps no cookie jar, so nothing is sent or kept.
    const res = await fetchFn(DIST_TAGS_URL, { redirect: 'error', signal });
    if (!res.ok) throw new UpdateCheckError(`the registry answered HTTP ${res.status}`);
    body = await readCapped(res, options.maxBytes ?? MAX_BODY_BYTES, abort);
  } catch (err) {
    if (err instanceof UpdateCheckError) throw err;
    if (timeout.aborted) throw new UpdateCheckError('the registry did not answer in time', { cause: err });
    throw new UpdateCheckError('could not reach the registry', { cause: err });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new UpdateCheckError('the registry answer was not valid JSON');
  }
  const latest =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).latest
      : undefined;
  if (!isValidVersion(latest)) {
    throw new UpdateCheckError('the registry answer did not hold a valid version');
  }
  return latest;
}
