import type { DistributionType } from '../ir/schema.js';

/** Deterministic seedable PRNG (mulberry32). Returns a function giving [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal sample via Box–Muller. */
export function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Sample a value from a distribution given already-resolved numeric params.
 * Recognized params: constant→{value}, exponential→{rate}, weibull→{shape,scale},
 * lognormal→{mu,sigma}. Returns 0 on unknown/invalid config.
 */
export function sampleDistribution(
  type: DistributionType,
  params: Record<string, number>,
  rng: () => number,
): number {
  switch (type) {
    case 'constant':
      return params.value ?? params.rate ?? 0;
    case 'exponential': {
      const rate = params.rate ?? params.lambda ?? 0;
      return rate > 0 ? -Math.log(1 - rng()) / rate : 0;
    }
    case 'weibull': {
      const k = params.shape ?? 1;
      const scale = params.scale ?? 1;
      return scale * Math.pow(-Math.log(1 - rng()), 1 / k);
    }
    case 'lognormal': {
      const mu = params.mu ?? 0;
      const sigma = params.sigma ?? 1;
      return Math.exp(mu + sigma * gaussian(rng));
    }
    default:
      return 0;
  }
}
