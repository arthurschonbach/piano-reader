/** Small seeded PRNG, so an exercise can be regenerated from its seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one value according to weights (weights <= 0 are skipped). */
export function weighted<T>(rng: () => number, items: [T, number][]): T {
  let total = 0;
  for (const [, w] of items) if (w > 0) total += w;
  let r = rng() * total;
  for (const [v, w] of items) {
    if (w <= 0) continue;
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}
