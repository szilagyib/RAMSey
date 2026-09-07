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
}

/** Ticks to aim for. Fewer on a narrow panel would crowd; more would clutter. */
const TARGET_TICKS = 4;

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
  if (hi > lo) return [lo, hi];
  const pad = lo === 0 ? 1 : Math.abs(lo) * 1e-3;
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
  const decimals = decimalsFor(step);
  // Two extra digits keep the bounds off float artefacts (0.30000000000000004)
  // without disturbing the value a label will show.
  const precision = decimals + 2;

  const min = round(Math.floor(lo / step) * step, precision);
  const max = round(Math.ceil(hi / step) * step, precision);
  const count = Math.max(1, Math.round((max - min) / step));

  const ticks = Array.from({ length: count + 1 }, (_, i) =>
    i === 0 ? min : i === count ? max : round(min + i * step, precision),
  );
  return { min, max, ticks, decimals };
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
  const decimals = decimalsFor(step);
  const precision = decimals + 2;

  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  for (let t = first; t <= max + step * 1e-9; t += step) {
    ticks.push(round(t, precision));
  }
  return { min, max, ticks, decimals };
}
