import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RPN_THRESHOLDS,
  fmeaToCsv,
  normalizeThresholds,
  rpnBand,
} from '../../../src/lib/fmea';
import type { FMEARow } from '../../../src/types/diagram';

const row = (overrides: Partial<FMEARow> = {}): FMEARow => ({
  id: 'r1',
  item: 'Pump',
  function: 'Deliver flow',
  failureMode: 'Seizes',
  effect: 'Loss of flow',
  severity: 8,
  occurrence: 3,
  detection: 4,
  rpn: 96,
  actions: 'Add standby',
  ...overrides,
});

describe('rpnBand', () => {
  const t = DEFAULT_RPN_THRESHOLDS;

  it('bands on the configured boundaries, inclusive', () => {
    expect(rpnBand(99, t)).toBe('low');
    expect(rpnBand(100, t)).toBe('medium');
    expect(rpnBand(199, t)).toBe('medium');
    expect(rpnBand(200, t)).toBe('high');
  });

  it('follows custom thresholds', () => {
    const strict = { medium: 20, high: 50 };
    expect(rpnBand(30, strict)).toBe('medium');
    expect(rpnBand(60, strict)).toBe('high');
  });
});

describe('normalizeThresholds', () => {
  it('keeps high at or above medium', () => {
    expect(normalizeThresholds({ medium: 300, high: 100 })).toEqual({ medium: 300, high: 300 });
  });

  it('clamps to the possible RPN range and rounds', () => {
    expect(normalizeThresholds({ medium: 0, high: 5000 })).toEqual({ medium: 1, high: 1000 });
    expect(normalizeThresholds({ medium: 10.6, high: 20.2 })).toEqual({ medium: 11, high: 20 });
  });
});

describe('fmeaToCsv', () => {
  it('writes a header row and one line per row', () => {
    const csv = fmeaToCsv([row(), row({ id: 'r2', item: 'Valve' })]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"RPN"');
    expect(lines[1]).toContain('"Pump"');
    expect(lines[2]).toContain('"Valve"');
  });

  // A comma or quote in a free-text cell must not break the columns.
  it('quotes fields and escapes embedded quotes', () => {
    const csv = fmeaToCsv([row({ effect: 'Loss of flow, then trip', actions: 'Say "no"' })]);
    expect(csv).toContain('"Loss of flow, then trip"');
    expect(csv).toContain('"Say ""no"""');
  });

  it('emits just the header for an empty table', () => {
    expect(fmeaToCsv([]).trimEnd().split('\r\n')).toHaveLength(1);
  });
});
