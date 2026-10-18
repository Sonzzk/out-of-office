// Small seeded RNG (mulberry32). All game randomness goes through this so runs
// can be replayed and tested.
export type Rng = () => number;

function step(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    const [value, next] = step(a);
    a = next;
    return value;
  };
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

// RNG whose position lives in plain data, so a running expedition can be saved
// mid-run and continue with exactly the same rolls.
export class Dice {
  constructor(public state: number) {
    this.state = state >>> 0;
  }
  next(): number {
    const [value, next] = step(this.state);
    this.state = next;
    return value;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(list: readonly T[]): T {
    return list[this.int(list.length)];
  }
}
