import { describe, it, expect } from 'vitest';
import { valueScale, timeScale } from '../../../src/lib/chartScale';

/**
 * Axis domains are derived from the data, never fixed.
 *
 * The metric these axes carry is availability, which is where a fixed 0..1 axis
 * fails hardest: a repairable system with no absorbing state spans something
 * like 1.00000000 .. 0.99996825, so on a 0..1 axis the whole curve is a dead
 * flat line pinned to the top and the trend — the reason to draw it — is
 * invisible. Scaling to the data is what makes the shape readable.
 */
describe('valueScale', () => {
  it('brackets the data on round numbers', () => {
    const s = valueScale(0.12, 0.87);
    expect(s.min).toBeLessThanOrEqual(0.12);
    expect(s.max).toBeGreaterThanOrEqual(0.87);
    expect(s.ticks[0]).toBe(s.min);
    expect(s.ticks[s.ticks.length - 1]).toBe(s.max);
  });

  it('resolves a near-1 plateau instead of flattening it', () => {
    const s = valueScale(0.99996825, 1);

    // The whole point: the domain follows the data, so a 3.2e-5 spread fills
    // the plot instead of hiding in the top pixel of a 0..1 axis.
    expect(s.max - s.min).toBeLessThan(0.001);
    expect(s.min).toBeGreaterThan(0.9999);
  });

  it('gives ticks enough decimals to read differently from each other', () => {
    const s = valueScale(0.99996825, 1);
    const labels = s.ticks.map(s.format);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('spends no decimals it does not need', () => {
    expect(valueScale(0, 100).decimals).toBe(0);
  });

  it('gives a flat series height to sit in rather than a zero-span domain', () => {
    const s = valueScale(1, 1);
    expect(s.max).toBeGreaterThan(s.min);
    expect(s.min).toBeLessThanOrEqual(1);
    expect(s.max).toBeGreaterThanOrEqual(1);
  });

  // Solver round-off is not a trend. A Markov chain with no absorbing state
  // cannot fail, so availability is exactly 1 at every point — but the matrix
  // exponential returns 1 give or take ~1e-12. Scaling an axis to that span
  // draws the round-off as a decay filling the whole plot, complete with
  // 12-decimal tick labels. Below a relative floor the series is flat, and has
  // to render as flat.
  describe('a span that is only round-off', () => {
    it('is treated as flat rather than magnified', () => {
      const s = valueScale(1 - 1e-12, 1);
      expect(s.max - s.min).toBeGreaterThan(1e-6);
      expect(s.decimals).toBeLessThanOrEqual(6);
    });

    it('is flat at the smallest representable span too', () => {
      const s = valueScale(1 - 2.2e-16, 1);
      // Rounding a domain this narrow used to put `max` *below* the data, which
      // pushed the top of the curve off the top of the plot.
      expect(s.max).toBeGreaterThanOrEqual(1);
      expect(s.min).toBeLessThanOrEqual(1 - 2.2e-16);
    });

    it('still resolves a spread that is small but real', () => {
      // 3.2e-5 on a near-1 metric is the repairable-system case: genuine, and
      // it must stay resolved rather than be rounded away as noise.
      const s = valueScale(0.99996825, 1);
      expect(s.max - s.min).toBeLessThan(0.001);
    });
  });

  it('never asks for more tick decimals than toFixed accepts', () => {
    // decimalsFor is unbounded, and toFixed throws past 100 digits — which
    // crashed the whole panel from inside the tick map.
    for (const [lo, hi] of [
      [1e-200, 2e-200],
      [1e-300, 1.5e-300],
      [Number.MIN_VALUE, Number.MIN_VALUE * 4],
    ]) {
      const s = valueScale(lo, hi);
      expect(s.decimals).toBeLessThanOrEqual(100);
      expect(() => s.ticks.map(s.format)).not.toThrow();
    }
  });

  it('gives every tick a distinct label', () => {
    for (const [lo, hi] of [
      [0.99996825, 1],
      [1 - 2.2e-16, 1],
      [0, 100],
      [1, 1],
    ]) {
      const s = valueScale(lo, hi);
      const labels = s.ticks.map(s.format);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('brackets the data even after rounding the bounds', () => {
    for (const [lo, hi] of [
      [0.12, 0.87],
      [0.99996825, 1],
      [1 - 2.2e-16, 1],
      [0, 0],
      [-5.5, 12.3],
    ]) {
      const s = valueScale(lo, hi);
      expect(s.min).toBeLessThanOrEqual(lo);
      expect(s.max).toBeGreaterThanOrEqual(hi);
    }
  });

  it('handles an all-zero series', () => {
    const s = valueScale(0, 0);
    expect(s.max).toBeGreaterThan(s.min);
    expect(Number.isFinite(s.min)).toBe(true);
  });
});

/**
 * Time is the independent axis: the curve should span the full plot width, so
 * the domain is the data's exact extent and the ticks land on round numbers
 * inside it. (Rounding the domain outward the way the value axis does would
 * leave the line stopping short of the right edge.)
 */
describe('timeScale', () => {
  it('keeps the exact extent so the curve spans the plot', () => {
    const s = timeScale(0, 8760);
    expect(s.min).toBe(0);
    expect(s.max).toBe(8760);
  });

  it('places round ticks inside the domain', () => {
    const s = timeScale(0, 8760);
    expect(s.ticks.length).toBeGreaterThan(1);
    for (const t of s.ticks) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(8760);
    }
    // Round, not arbitrary: every tick is a multiple of the step.
    const step = s.ticks[1] - s.ticks[0];
    for (const t of s.ticks) expect(Math.abs(t / step - Math.round(t / step))).toBeLessThan(1e-9);
  });

  it('survives a single time point', () => {
    const s = timeScale(5, 5);
    expect(s.max).toBeGreaterThan(s.min);
  });
});
