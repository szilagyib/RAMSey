import { useState } from 'react';
import { valueScale, timeScale } from '../../lib/chartScale';

// ---------------------------------------------------------------------------
// A compact single-series line chart for a metric over time.
//
// Sized in viewBox units and scaled to the panel by `w-full`, so it needs no
// width measurement to be responsive — worth it here because the inspector
// panel is user-resizable across a wide range.
// ---------------------------------------------------------------------------

const VIEW = { w: 280, h: 150 };
/** The bottom band fits the time row; the left gutter is measured per render. */
const PAD = { top: 8, right: 10, bottom: 18 };
const PLOT_H = VIEW.h - PAD.top - PAD.bottom;

/** Gap between a y-axis label and the plot it labels. */
const LABEL_INSET = 4;
/** Clearance kept left of the widest label, so it never sits on the edge. */
const LABEL_MARGIN = 2;

/**
 * Bounds on the y-axis gutter.
 *
 * A fixed gutter was wrong in both directions: it was documented as fitting a
 * 5-decimal label, so a span just above the noise floor overflowed it (labels
 * ran 19 units past the left edge and were clipped), while the ordinary
 * 0.0…1.0 case needed a third of it and the plot paid for the rest.
 *
 * Measured instead, and bounded: the maximum holds the widest label the scale
 * can produce — ten decimals, see MAX_DECIMALS — and refuses to grow past it,
 * since a gutter that expands without limit just moves the crowding into the
 * plot. The minimum keeps short labels off the gridlines.
 */
const GUTTER = { min: 20, max: 64 };

/**
 * Rendered width of a numeric label at the 8px axis font, in viewBox units.
 *
 * Measured from the real face (IBM Plex Sans, tabular figures): digits share
 * one advance, and the separators are narrower. Estimated rather than measured
 * live because the alternative is a DOM round-trip per render to place an axis.
 */
const CHAR_WIDTH: Record<string, number> = { '.': 2.3, ',': 2.3, '-': 3.0, '+': 3.0, e: 4.3 };
const DIGIT_WIDTH = 4.85;

function labelWidth(label: string): number {
  let width = 0;
  for (const ch of label) width += CHAR_WIDTH[ch] ?? DIGIT_WIDTH;
  return width;
}

export interface TimeSeriesChartProps {
  /** Sample times, ascending. */
  time: number[];
  /** Metric value at each time. Same length as `time`. */
  values: number[];
  /** Name of the metric, used as the caption and the accessible label. */
  valueLabel: string;
  /** Unit suffix for the time axis, e.g. 'h'. */
  timeUnit: string;
}

/** Full-precision but without trailing zeros — the readout shows exact values. */
function exact(value: number, decimals: number): string {
  return Number(value.toFixed(Math.min(20, decimals + 4))).toString();
}

export function TimeSeriesChart({ time, values, valueLabel, timeUnit }: TimeSeriesChartProps) {
  const [active, setActive] = useState<number | null>(null);

  // Nothing to plot, and nothing to fake: an empty series used to reach the
  // scales as Math.min() of nothing (Infinity, so a NaN domain) and the
  // accessible label as time[0].toFixed of undefined. A length disagreement
  // has the same effect one index in.
  if (values.length === 0 || time.length !== values.length) return null;

  const y = valueScale(Math.min(...values), Math.max(...values));
  const x = timeScale(time[0], time[time.length - 1]);

  // Sized to the labels this particular series produces, so they always fit and
  // never reserve room they do not use.
  const gutter = Math.min(
    GUTTER.max,
    Math.max(
      GUTTER.min,
      Math.max(...y.ticks.map((t) => labelWidth(y.format(t)))) + LABEL_INSET + LABEL_MARGIN,
    ),
  );
  const plotW = VIEW.w - gutter - PAD.right;

  // spread() in chartScale guarantees a non-zero span on both axes, so a flat
  // series or a single sample scales instead of dividing by zero.
  const px = (t: number) => gutter + ((t - x.min) / (x.max - x.min)) * plotW;
  const py = (v: number) => PAD.top + (1 - (v - y.min) / (y.max - y.min)) * PLOT_H;

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(time[i])} ${py(v)}`).join(' ');
  const band = plotW / Math.max(1, values.length - 1);

  const last = values.length - 1;

  const step = (delta: number) =>
    setActive((current) => {
      if (current === null) return delta > 0 ? 0 : last;
      return Math.min(last, Math.max(0, current + delta));
    });

  /**
   * Idle, this names the series and where it ends; hovering hands it over to
   * the point under the pointer.
   *
   * The final value lives here rather than on the plot because valueScale
   * clamps its domain to the data, so a monotone curve's last point sits
   * exactly on a plot boundary — a label anchored there runs back over the
   * incoming curve, and pushing it clear lands it on the axis row. In the
   * caption it costs no plot width, which matters on a panel this narrow, and
   * it cannot collide with anything. The value stays reachable at full
   * precision by hover, by keyboard, and in the values table.
   */
  const readout =
    active === null
      ? `${valueLabel} · ends at ${y.format(values[last])} · t in ${timeUnit}`
      : `t = ${exact(time[active], x.decimals)} ${timeUnit} · ${exact(values[active], y.decimals)}`;

  return (
    <figure className="m-0">
      {/* One element, so the readout is a single node for assistive tech to
          announce and the value never splits across spans. */}
      <figcaption
        aria-live="polite"
        className="mb-0.5 truncate text-[10px] tabular-nums text-surface-500"
      >
        {readout}
      </figcaption>

      <svg
        className="chart-plot h-auto w-full rounded outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-label={`${valueLabel} over time, ${values.length} samples from ${exact(
          time[0],
          x.decimals,
        )} to ${exact(time[last], x.decimals)} ${timeUnit}`}
        tabIndex={0}
        onFocus={() => setActive((current) => current ?? 0)}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        onKeyDown={(e) => {
          // The canvas nudges the selected node on arrow keys, so these must
          // not reach it — same guard the inline label editor uses.
          const handled: Record<string, () => void> = {
            ArrowRight: () => step(1),
            ArrowLeft: () => step(-1),
            Home: () => setActive(0),
            End: () => setActive(last),
            Escape: () => setActive(null),
          };
          const action = handled[e.key];
          if (!action) return;
          e.preventDefault();
          e.stopPropagation();
          action();
        }}
      >
        {/* Grid + axis labels. Solid hairlines one shade off the surface: a
            dashed grid reads as a threshold that isn't there. */}
        <g className="chart-axis">
          {y.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={gutter}
                x2={gutter + plotW}
                y1={py(tick)}
                y2={py(tick)}
                className="text-surface-200"
                stroke="currentColor"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={gutter - LABEL_INSET}
                y={py(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-surface-400 text-[8px] tabular-nums"
              >
                {y.format(tick)}
              </text>
            </g>
          ))}

          {x.ticks.map((tick) => (
            <text
              key={tick}
              x={px(tick)}
              y={VIEW.h - 6}
              textAnchor="middle"
              className="fill-surface-400 text-[8px] tabular-nums"
            >
              {x.format(tick)}
            </text>
          ))}
        </g>

        <path
          className="chart-line text-primary-600 dark:text-primary-400"
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {active !== null && (
          <g>
            <line
              x1={px(time[active])}
              x2={px(time[active])}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              className="text-surface-300"
              stroke="currentColor"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/* 2px surface ring so the marker reads clearly over the line. */}
            <circle
              cx={px(time[active])}
              cy={py(values[active])}
              r={3}
              className="fill-primary-600 text-surface-50 dark:fill-primary-400"
              stroke="currentColor"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        {/* One hit band per sample: the pointer only has to be nearest, never
            on the 2px line. */}
        {values.map((_, i) => (
          <rect
            key={i}
            className="chart-hit"
            x={Math.max(gutter, px(time[i]) - band / 2)}
            y={PAD.top}
            width={band}
            height={PLOT_H}
            fill="transparent"
            onPointerEnter={() => setActive(i)}
          />
        ))}
      </svg>
    </figure>
  );
}
