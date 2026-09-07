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
/** Left gutter fits a 5-decimal tick label; the bottom band fits the time row. */
const PAD = { top: 8, right: 10, bottom: 18, left: 44 };
const PLOT_W = VIEW.w - PAD.left - PAD.right;
const PLOT_H = VIEW.h - PAD.top - PAD.bottom;

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

  const y = valueScale(Math.min(...values), Math.max(...values));
  const x = timeScale(time[0], time[time.length - 1]);

  // spread() in chartScale guarantees a non-zero span on both axes, so a flat
  // series or a single sample scales instead of dividing by zero.
  const px = (t: number) => PAD.left + ((t - x.min) / (x.max - x.min)) * PLOT_W;
  const py = (v: number) => PAD.top + (1 - (v - y.min) / (y.max - y.min)) * PLOT_H;

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(time[i])} ${py(v)}`).join(' ');
  const band = PLOT_W / Math.max(1, values.length - 1);

  const last = values.length - 1;
  // The label has to dodge the line, and the clear side depends on where the
  // curve arrives from: a falling curve comes in from above-left, so the space
  // above the last point is already occupied. Flat and rising curves leave it
  // free.
  const endpointFalling = values.length > 1 && values[last] < values[last - 1];

  const step = (delta: number) =>
    setActive((current) => {
      if (current === null) return delta > 0 ? 0 : last;
      return Math.min(last, Math.max(0, current + delta));
    });

  const readout =
    active === null
      ? `${valueLabel} · t in ${timeUnit}`
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
                x1={PAD.left}
                x2={PAD.left + PLOT_W}
                y1={py(tick)}
                y2={py(tick)}
                className="text-surface-200"
                stroke="currentColor"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD.left - 4}
                y={py(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-surface-400 text-[8px] tabular-nums"
              >
                {tick.toFixed(y.decimals)}
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
              {tick.toFixed(x.decimals)}
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

        {/* Direct label on the last point, at tick precision: the headline
            value is readable without hovering anything. */}
        {values.length > 0 && (
          <text
            className="chart-endpoint fill-surface-600 text-[8px] font-medium tabular-nums"
            x={px(time[last])}
            y={py(values[last]) + (endpointFalling ? 11 : -6)}
            textAnchor="end"
          >
            {values[last].toFixed(y.decimals)}
          </text>
        )}

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
            x={Math.max(PAD.left, px(time[i]) - band / 2)}
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
