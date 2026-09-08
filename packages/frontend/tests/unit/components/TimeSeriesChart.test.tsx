import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TimeSeriesChart } from '../../../src/components/editor/TimeSeriesChart';

afterEach(cleanup);

const series = (values: number[], step = 100) => ({
  time: values.map((_, i) => i * step),
  values,
});

/** The transient solver's own shape: a slow decay off a near-1 plateau. */
const PLATEAU = [1, 0.99999206, 0.99998413, 0.9999762, 0.99996825];

const hitBands = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<SVGRectElement>('.chart-hit'));

const axisLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.chart-axis text')).map((t) => t.textContent ?? '');

const chart = (props: Partial<Parameters<typeof TimeSeriesChart>[0]> = {}) =>
  render(
    <TimeSeriesChart
      {...series(PLATEAU)}
      valueLabel="availability"
      timeUnit="h"
      {...(props as object)}
    />,
  );

describe('TimeSeriesChart', () => {
  it('plots one point per sample', () => {
    const { container } = chart();
    const d = container.querySelector('.chart-line')?.getAttribute('d') ?? '';
    expect(d.match(/[ML]/g)).toHaveLength(PLATEAU.length);
  });

  // The whole reason this is a chart and not a column of numbers. A 3.2e-5
  // spread on a fixed 0..1 axis is a flat line in the top pixel; scaled to the
  // data it is a readable decay.
  it('scales the value axis to the data instead of the metric range', () => {
    const { container } = chart();
    const labels = axisLabels(container);
    expect(labels.some((l) => l.startsWith('0.9999'))).toBe(true);
    expect(labels).not.toContain('0.00');
    expect(labels).not.toContain('0.50');
  });

  it('reads out the value at the hovered sample', () => {
    const { container } = chart();
    fireEvent.pointerEnter(hitBands(container)[2]);

    expect(screen.getByText(/0\.99998413/)).toBeTruthy();
    expect(screen.getByText(/200\s*h/)).toBeTruthy();
  });

  it('moves the readout with the pointer', () => {
    const { container } = chart();
    fireEvent.pointerEnter(hitBands(container)[1]);
    fireEvent.pointerEnter(hitBands(container)[4]);

    expect(screen.getByText(/0\.99996825/)).toBeTruthy();
    expect(screen.queryByText(/0\.99999206/)).toBeNull();
  });

  it('clears the readout when the pointer leaves', () => {
    const { container } = chart();
    fireEvent.pointerEnter(hitBands(container)[2]);
    fireEvent.pointerLeave(container.querySelector('.chart-plot')!);

    expect(screen.queryByText(/0\.99998413/)).toBeNull();
  });

  // A tooltip must not be the only way to reach a value: the same readout has
  // to be available to someone who never uses a pointer.
  it('exposes the same readout to the keyboard', () => {
    const { container } = chart();
    const plot = container.querySelector<SVGSVGElement>('.chart-plot')!;

    fireEvent.focus(plot);
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(screen.getByText(/0\.99999206/)).toBeTruthy();

    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(screen.getByText(/0\.99998413/)).toBeTruthy();

    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    expect(screen.getByText(/0\.99999206/)).toBeTruthy();
  });

  // The direct label is rounded to tick precision while the readout above the
  // plot carries the exact value. Two roles, two precisions — and no two nodes
  // rendering the same string, which would make a value query ambiguous.
  it('labels the last point directly, so the headline value needs no hover', () => {
    const { container } = chart();
    expect(container.querySelector('.chart-endpoint')?.textContent).toBe('0.99997');
  });

  // The label has to dodge the line, and which side is clear depends on the
  // direction the curve arrives from: a falling curve comes in from above-left,
  // so the space above the last point is exactly where the line already is.
  describe('endpoint label placement', () => {
    const lastPointY = (container: HTMLElement) => {
      const d = container.querySelector('.chart-line')!.getAttribute('d')!;
      return Number(d.match(/L([\d.]+) ([\d.]+)$/)![2]);
    };
    const labelY = (container: HTMLElement) =>
      Number(container.querySelector('.chart-endpoint')!.getAttribute('y'));

    it('sits below the last point on a falling curve', () => {
      const { container } = chart({ ...series([1, 0.8, 0.6]) });
      // SVG y grows downward, so "below" is a larger y.
      expect(labelY(container)).toBeGreaterThan(lastPointY(container));
    });

    it('sits above the last point on a rising curve', () => {
      const { container } = chart({ ...series([0.6, 0.8, 1]) });
      expect(labelY(container)).toBeLessThan(lastPointY(container));
    });

    it('names the metric and the time unit while idle', () => {
      chart();
      expect(screen.getByText(/availability/)).toBeTruthy();
      expect(screen.getByText(/t in h/)).toBeTruthy();
    });

    // A constant curve is a real result — a system that never leaves its initial
    // state. It must draw a line, not divide by a zero-height domain.
    it('renders a flat series without degenerate coordinates', () => {
      const { container } = chart({ ...series([0.5, 0.5, 0.5]) });
      const d = container.querySelector('.chart-line')?.getAttribute('d') ?? '';
      expect(d).not.toContain('NaN');
      expect(d.length).toBeGreaterThan(0);
    });

    // At 61 samples the final step is a difference between two plateau values,
    // which solver round-off can flip either way. The side has to come from the
    // curve's overall direction, or the label jumps between runs of the same
    // model and can land on the stroke it is meant to dodge.
    it('does not flip side when the final step is round-off', () => {
      const { container } = chart({ ...series([1, 0.9, 0.8, 0.8 + 1e-12]) });
      // Falling overall, even though the last step ticks up.
      expect(labelY(container)).toBeGreaterThan(lastPointY(container));
    });
    // A falling curve whose last point lands on the bottom gridline pushed the
    // label below the plot and into the time-axis tick row.
    it('stays inside the plot when the curve ends at the bottom', () => {
      const { container } = chart({ ...series([1, 0.5, 0]) });
      const label = labelY(container);
      expect(label).toBeLessThan(138); // plot bottom is 132; axis ticks sit at 144
    });
  });

  // An empty series is not a curve. It reached here as a TypeError, because the
  // accessible label read time[0] before anything checked the length.
  it('renders nothing for an empty series', () => {
    const { container } = chart({ time: [], values: [] });
    expect(container.querySelector('.chart-line')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders a single sample without crashing', () => {
    const { container } = chart({ ...series([0.5]) });
    expect(container.querySelector('.chart-line')?.getAttribute('d')).not.toContain('NaN');
  });

  it('describes itself for a screen reader', () => {
    chart();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/availability/);
  });
});
