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

  // The endpoint used to be labelled on the plot itself, which cannot work:
  // valueScale clamps its domain to the data, so a monotone curve's last point
  // always lands exactly on a plot boundary — the floor for a decay, the
  // ceiling for a rise. A label anchored there runs left over the incoming
  // curve, and pushing it outward lands it on the axis row. It reads as the
  // caption instead, where it costs no plot space and cannot collide.
  it('names the final value without needing hover', () => {
    chart();
    expect(screen.getByText(/ends at 0\.99997/)).toBeTruthy();
  });

  it('draws no label on the plot', () => {
    const { container } = chart();
    expect(container.querySelector('.chart-endpoint')).toBeNull();
  });

  it('names the metric and the time unit while idle', () => {
    chart();
    expect(screen.getByText(/availability/)).toBeTruthy();
    expect(screen.getByText(/t in h/)).toBeTruthy();
  });

  // The hovered value replaces it, so the caption never shows two numbers at
  // once and the reader is never comparing the wrong pair.
  it('gives the caption over to the hovered value', () => {
    const { container } = chart();
    fireEvent.pointerEnter(hitBands(container)[2]);

    expect(screen.getByText(/0\.99998413/)).toBeTruthy();
    expect(screen.queryByText(/ends at/)).toBeNull();
  });

  // A constant curve is a real result — a system that never leaves its initial
  // state. It must draw a line, not divide by a zero-height domain.
  it('renders a flat series without degenerate coordinates', () => {
    const { container } = chart({ ...series([0.5, 0.5, 0.5]) });
    const d = container.querySelector('.chart-line')?.getAttribute('d') ?? '';
    expect(d).not.toContain('NaN');
    expect(d.length).toBeGreaterThan(0);
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

  // The gutter holding the y-axis labels was a fixed 44 units, documented as
  // fitting a 5-decimal label. Both directions were wrong: a span just above the
  // noise floor needs ten decimals and overflowed it, while the common cases
  // (0.0 .. 1.0) need three and left most of it empty. It is measured now, so
  // labels fit without the plot paying for width nothing uses.
  describe('the y-axis gutter', () => {
    /** Where the plot starts — the left end of the gridlines. */
    const gutterOf = (container: HTMLElement) =>
      Number(container.querySelector('.chart-axis line')!.getAttribute('x1'));

    const widestLabel = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('.chart-axis text'))
        .map((t) => t.textContent ?? '')
        .reduce((a, b) => (b.length > a.length ? b : a), '');

    /**
     * Rendered width of a label at the 8px axis font.
     *
     * These advances were measured in a browser against the real face (IBM Plex
     * Sans, tabular figures), and are restated here rather than imported from
     * the component on purpose: a regression in its own width table should fail
     * this test rather than move it.
     */
    const renderedWidth = (label: string) =>
      [...label].reduce((w, ch) => w + (ch === '.' ? 2.3 : ch === '-' ? 3.0 : 4.85), 0);

    it('fits a ten-decimal label without clipping it', () => {
      // Just above the 1e-9 noise floor, so the ticks need every decimal.
      const { container } = chart({ ...series([1 - 1.1e-9, 1 - 5e-10, 1]) });
      const label = widestLabel(container);

      expect(label.length).toBeGreaterThan(9);
      expect(gutterOf(container)).toBeGreaterThanOrEqual(renderedWidth(label));
    });

    it('gives the room back when the labels are short', () => {
      const { container } = chart({ ...series([0, 0.5, 1]) });

      expect(widestLabel(container).length).toBeLessThan(5);
      // Narrower than the old fixed 44, so the plot is wider than it used to be.
      expect(gutterOf(container)).toBeLessThan(44);
    });

    // Growing without limit would just move the crowding into the plot.
    it('stays within a bounded share of the width', () => {
      for (const values of [
        [1 - 1.1e-9, 1],
        [1e-6, 1e-6 + 4e-12],
        [0.99996825, 1],
        [0, 1],
        [-12345.6, 98765.4],
      ]) {
        const { container } = chart({ ...series(values) });
        const gutter = gutterOf(container);
        expect(gutter).toBeGreaterThanOrEqual(18);
        expect(gutter).toBeLessThanOrEqual(64);
        cleanup();
      }
    });

    it('keeps every tick label clear of the left edge', () => {
      for (const values of [
        [1 - 1.1e-9, 1],
        [1e-6, 1e-6 + 4e-12],
        [0, 1],
      ]) {
        const { container } = chart({ ...series(values) });
        for (const text of Array.from(container.querySelectorAll('.chart-axis text'))) {
          const anchorX = Number(text.getAttribute('x'));
          // Anchored `end`, so the label runs leftward from its x.
          expect(anchorX - renderedWidth(text.textContent ?? '')).toBeGreaterThanOrEqual(0);
        }
        cleanup();
      }
    });
  });

  it('describes itself for a screen reader', () => {
    chart();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/availability/);
  });
});
