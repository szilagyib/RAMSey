// ---------------------------------------------------------------------------
// Axis scales derived from the data.
//
// Nothing here is fixed to a metric's theoretical range. Availability lives in
// [0, 1], but a repairable system's curve can span 1.00000000 .. 0.99996825 —
// on a 0..1 axis that is a flat line in the top pixel, and the trend the chart
// exists to show is gone. Scaling to the data is what makes the shape readable,
// so both axes take their domain from the values they were given.
// ---------------------------------------------------------------------------

export interface Scale {
  /** Domain start — the value at the axis origin. */
  min: number;
  /** Domain end. */
  max: number;
  /** Tick positions, in domain units. */
  ticks: number[];
  /** Decimals a tick label needs for the ticks to read differently. */
  decimals: number;
  /** Renders a tick. Use this rather than toFixed: it also covers the domains
   *  too narrow for fixed notation to label distinctly. */
  format: (value: number) => string;
}

/** Ticks to aim for. Fewer on a narrow panel would crowd; more would clutter. */
const TARGET_TICKS = 4;

/**
 * Relative span below which a series is round-off rather than signal.
 *
 * Scaling to the data is the point of this module, but it cuts both ways: a
 * quantity that is mathematically constant still comes back from the solver
 * with ~1e-12 of jitter, and an axis fitted to that draws the jitter as a
 * full-height trend with twelve-decimal labels. Nine significant figures is
 * far past what any reliability input is known to — rates are good to one or
 * two — so a span this small is noise, and noise renders flat.
 */
const NOISE_FLOOR = 1e-9;

/**
 * Most decimals a fixed-notation tick may use. Also toFixed's hard ceiling is
 * 100, past which it throws — which took the whole panel down from inside the
 * tick loop.
 */
const MAX_DECIMALS = 12;

/**
 * Round a raw step up to a 1-2-5 multiple of a power of ten, so ticks land on
 * numbers people read easily.
 *
 * The thresholds are geometric midpoints (√2, √10, √50) rather than the
 * integers, which picks the *nearest* nice step instead of always rounding up.
 * A raw step of 2190 becomes 2000, not 5000 — the difference between five ticks
 * across a year and two.
 */
function niceStep(rawStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor =
    normalized >= 7.0711 ? 10 : normalized >= 3.1623 ? 5 : normalized >= 1.4142 ? 2 : 1;
  return factor * magnitude;
}

/** Decimals needed to write `step` — and therefore any tick — exactly. */
function decimalsFor(step: number): number {
  return Math.max(0, Math.ceil(-Math.log10(step)));
}

/**
 * Tick precision for a step, plus the formatter that goes with it.
 *
 * A step needing more than MAX_DECIMALS cannot be written in fixed notation
 * without every label collapsing to the same string, so those domains switch to
 * exponential rather than print identical numbers at different heights.
 */
function precisionFor(step: number): Pick<Scale, 'decimals' | 'format'> & { fixed: boolean } {
  const needed = decimalsFor(step);
  if (!Number.isFinite(needed) || needed > MAX_DECIMALS) {
    return { decimals: MAX_DECIMALS, format: (value) => value.toExponential(3), fixed: false };
  }
  return { decimals: needed, format: (value) => value.toFixed(needed), fixed: true };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Widen a zero-width span so a flat series has somewhere to sit.
 *
 * A constant curve is a real result — a system that never leaves its initial
 * state — and it must render as a line across the middle rather than divide by
 * a zero-height domain.
 */
function spread(lo: number, hi: number): [number, number] {
  const magnitude = Math.max(Math.abs(lo), Math.abs(hi));
  // Anything at or under the noise floor counts as no span at all.
  if (hi - lo > magnitude * NOISE_FLOOR && hi > lo) return [lo, hi];
  const pad = magnitude === 0 ? 1 : magnitude * 1e-3;
  return [lo - pad, hi + pad];
}

/**
 * Scale for the measured axis: the domain is rounded *outward* to whole ticks,
 * so the curve has a little headroom and the first and last gridlines are the
 * plot's own edges.
 */
export function valueScale(dataMin: number, dataMax: number, target = TARGET_TICKS): Scale {
  const [lo, hi] = spread(dataMin, dataMax);
  const step = niceStep((hi - lo) / target);
  const { decimals, format, fixed } = precisionFor(step);

  // Below the denormal range a step has no representable value, so there is
  // nothing to subdivide and dividing by it yields Infinity. The two ends are
  // the only honest ticks — better than the empty axis that produced.
  if (!Number.isFinite(step) || step <= 0) {
    return { min: lo, max: hi, ticks: [lo, hi], decimals, format };
  }

  // Two extra digits keep the bounds off float artefacts (0.30000000000000004)
  // without disturbing the value a label will show — but only where the labels
  // are fixed-point at all. Past that cap, rounding to it collapses every
  // interior tick onto the same number, so the raw values stand.
  const snap = (value: number) => (fixed ? round(value, decimals + 2) : value);

  // Rounding a very narrow domain can land `max` just *below* the data, which
  // puts the top of the curve outside the plot. The noise floor should keep us
  // out of that range entirely; clamping to the data makes it impossible.
  const min = Math.min(dataMin, snap(Math.floor(lo / step) * step));
  const max = Math.max(dataMax, snap(Math.ceil(hi / step) * step));
  const spanSteps = Math.round((max - min) / step);
  const count = Number.isFinite(spanSteps) ? Math.max(1, spanSteps) : 1;

  const ticks = Array.from({ length: count + 1 }, (_, i) =>
    i === 0 ? min : i === count ? max : snap(min + i * step),
  );
  return { min, max, ticks, decimals, format };
}

/**
 * Scale for the time axis: the domain is the data's exact extent, with round
 * ticks placed inside it.
 *
 * Rounding outward the way the value axis does would leave the curve stopping
 * short of the right edge — a mission that runs to 8760 h would be drawn on an
 * axis to 10000, making the plot look like it has data it does not.
 */
export function timeScale(dataMin: number, dataMax: number, target = TARGET_TICKS): Scale {
  const [min, max] = spread(dataMin, dataMax);
  const step = niceStep((max - min) / target);
  const { decimals, format, fixed } = precisionFor(step);

  if (!Number.isFinite(step) || step <= 0) {
    return { min, max, ticks: [min, max], decimals, format };
  }

  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  for (let t = first; t <= max + step * 1e-9; t += step) {
    ticks.push(fixed ? round(t, decimals + 2) : t);
  }
  return { min, max, ticks, decimals, format };
}
