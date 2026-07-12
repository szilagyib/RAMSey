import { describe, it, expect } from 'vitest';
import { getNodeColor, tintFill, nodeColorStyle } from '../../../src/lib/nodeColor';

describe('getNodeColor', () => {
  it('accepts only #rrggbb strings', () => {
    expect(getNodeColor({ color: '#ff8800' })).toBe('#ff8800');
    expect(getNodeColor({ color: '#FF8800' })).toBe('#FF8800');
  });

  it('rejects everything else (absent, null reset, short hex, junk)', () => {
    expect(getNodeColor({})).toBeNull();
    expect(getNodeColor(undefined)).toBeNull();
    expect(getNodeColor({ color: null })).toBeNull();
    expect(getNodeColor({ color: '#f80' })).toBeNull();
    expect(getNodeColor({ color: 'red' })).toBeNull();
    expect(getNodeColor({ color: '#ff880' })).toBeNull();
    expect(getNodeColor({ color: 42 })).toBeNull();
  });
});

describe('tintFill / nodeColorStyle', () => {
  it('appends a 15% alpha channel for the fill', () => {
    expect(tintFill('#ff8800')).toBe('#ff880026');
  });

  it('builds the tint style for a colored node and nothing otherwise', () => {
    expect(nodeColorStyle({ color: '#ff8800' })).toEqual({
      borderColor: '#ff8800',
      background: '#ff880026',
      color: 'var(--dg-undeveloped-text)',
    });
    expect(nodeColorStyle({})).toBeUndefined();
    expect(nodeColorStyle({ color: null })).toBeUndefined();
  });
});
