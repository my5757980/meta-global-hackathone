/** Deterministic random numbers so every fresh demo database is identical. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** mulberry32 */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Weighted pick: [[value, weight], ...] */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((a, [, w]) => a + w, 0);
    let r = this.next() * total;
    for (const [v, w] of items) {
      if ((r -= w) <= 0) return v;
    }
    return items[items.length - 1]![0];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }
  round(n: number, step: number): number {
    return Math.round(n / step) * step;
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
