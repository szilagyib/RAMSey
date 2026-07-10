import { describe, it, expect } from 'vitest';
import { getControlPoint, quadraticPath } from '../../../src/diagram-types/shared/edgeShape';

describe('getControlPoint', () => {
  it('returns the point when both coordinates are numbers', () => {
    expect(getControlPoint({ cpX: 10, cpY: -5 })).toEqual({ x: 10, y: -5 });
  });

  it('returns null for absent, null (reset), or partial coordinates', () => {
    expect(getControlPoint({})).toBeNull();
    expect(getControlPoint(undefined)).toBeNull();
    expect(getControlPoint({ cpX: null, cpY: null })).toBeNull();
    expect(getControlPoint({ cpX: 10 })).toBeNull();
    expect(getControlPoint({ cpX: '10', cpY: '20' })).toBeNull();
  });
});

describe('quadraticPath', () => {
  it('builds a quadratic bezier through the control point', () => {
    const [path] = quadraticPath(0, 0, 50, 100, 100, 0);
    expect(path).toBe('M 0,0 Q 50,100 100,0');
  });

  it('places the label at the curve t=0.5 point (0.25·P0 + 0.5·C + 0.25·P1)', () => {
    const [, labelX, labelY] = quadraticPath(0, 0, 50, 100, 100, 0);
    expect(labelX).toBe(50); // 0 + 25 + 25
    expect(labelY).toBe(50); // 0 + 50 + 0
  });
});
