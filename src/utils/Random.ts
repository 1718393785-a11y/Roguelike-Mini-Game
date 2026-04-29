export function hashSeed(seedText: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class Random {
  private state: number;

  constructor(seedText: string | number) {
    this.state = typeof seedText === 'number' ? seedText >>> 0 : hashSeed(seedText);
  }

  next(): number {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

export function hashRandomValues(values: readonly number[]): string {
  let h = 2166136261 >>> 0;
  for (const value of values) {
    const n = Math.floor(value * 1000000000) >>> 0;
    h ^= n;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
