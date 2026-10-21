/** Sliding-window limiter keyed by string (IP, socket id, ...). */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Records a hit and returns whether it is within the limit. Rejected hits are not recorded. */
  take(key: string): boolean {
    const list = this.recent(key);
    if (list.length >= this.max) return false;
    list.push(this.now());
    this.hits.set(key, list);
    return true;
  }

  /** Records a hit unconditionally (for counting failures). */
  record(key: string): void {
    const list = this.recent(key);
    list.push(this.now());
    this.hits.set(key, list);
  }

  isLimited(key: string): boolean {
    return this.recent(key).length >= this.max;
  }

  forget(key: string): void {
    this.hits.delete(key);
  }

  prune(): void {
    for (const key of [...this.hits.keys()]) this.recent(key);
  }
}
