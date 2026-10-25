/**
 * A least-recently-used cache bounded by the total size of its string values
 * rather than by entry count. Highlighted blocks range from a few hundred bytes
 * to hundreds of kilobytes, so an entry cap would either waste the budget or
 * blow it.
 *
 * A `Map` iterates in insertion order, so re-inserting a key on every hit keeps
 * the least recently used one first in line for eviction.
 */
export class ByteLru {
  private readonly entries = new Map<string, { value: string; bytes: number }>();
  private totalBytes = 0;
  private hitCount = 0;
  private missCount = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): string | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      this.missCount++;
      return undefined;
    }
    this.hitCount++;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string): void {
    const bytes = Buffer.byteLength(value, 'utf8');
    this.delete(key);
    // Caching a value that is itself over budget would evict everything else
    // and then be evicted by the next insert.
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { value, bytes });
    this.totalBytes += bytes;
    for (const [oldest, entry] of this.entries) {
      if (this.totalBytes <= this.maxBytes) break;
      this.entries.delete(oldest);
      this.totalBytes -= entry.bytes;
    }
  }

  private delete(key: string): void {
    const entry = this.entries.get(key);
    if (entry === undefined) return;
    this.entries.delete(key);
    this.totalBytes -= entry.bytes;
  }

  stats(): { entries: number; bytes: number; hits: number; misses: number } {
    return {
      entries: this.entries.size,
      bytes: this.totalBytes,
      hits: this.hitCount,
      misses: this.missCount,
    };
  }
}
