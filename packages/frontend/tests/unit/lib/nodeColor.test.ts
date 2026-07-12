import { describe, it, expect } from 'vitest';
import {
  getNodeColor,
  getNodeFill,
  getNodeText,
  getEdgeColor,
  tintFill,
  nodeColorStyle,
  resolveTokenColors,
} from '../../../src/lib/nodeColor';

describe('per-channel getters', () => {
  it('read the right key and validate #rrggbb', () => {
    expect(getNodeColor({ color: '#ff8800' })).toBe('#ff8800');
    expect(getNodeFill({ fillColor: '#00ff00' })).toBe('#00ff00');
    expect(getNodeText({ textColor: '#0000ff' })).toBe('#0000ff');
    expect(getEdgeColor({ color: '#123456' })).toBe('#123456');
  });

  it('reject absent, null, short hex and junk', () => {
    for (const g of [getNodeColor, getNodeFill, getNodeText, getEdgeColor]) {
      expect(g({})).toBeNull();
      expect(g(undefined)).toBeNull();
    }
    expect(getNodeColor({ color: null })).toBeNull();
    expect(getNodeFill({ fillColor: '#f80' })).toBeNull();
    expect(getNodeText({ textColor: 'blue' })).toBeNull();
  });
});

describe('nodeColorStyle (independent fill / border / text)', () => {
  it('is undefined when nothing is set', () => {
    expect(nodeColorStyle({})).toBeUndefined();
  });

  it('border alone tints the fill and neutralizes text', () => {
    expect(nodeColorStyle({ color: '#ff8800' })).toEqual({
      borderColor: '#ff8800',
      background: '#ff880026',
      color: 'var(--dg-undeveloped-text)',
    });
  });

  it('fill alone sets only the background (+ neutral text), leaving the border default', () => {
    expect(nodeColorStyle({ fillColor: '#00ff00' })).toEqual({
      background: '#00ff00',
      color: 'var(--dg-undeveloped-text)',
    });
  });

  it('text alone sets only the label color', () => {
    expect(nodeColorStyle({ textColor: '#0000ff' })).toEqual({ color: '#0000ff' });
  });

  it('all three combine, explicit fill overriding the border tint', () => {
    expect(nodeColorStyle({ color: '#ff8800', fillColor: '#111111', textColor: '#ffffff' })).toEqual({
      borderColor: '#ff8800',
      background: '#111111',
      color: '#ffffff',
    });
  });
});

describe('resolveTokenColors (SVG/token nodes)', () => {
  const def = { fill: 'F', stroke: 'S', text: 'T' };

  it('returns defaults when nothing is set', () => {
    expect(resolveTokenColors({}, def)).toEqual(def);
  });

  it('maps border→stroke with a tinted fill, neutral text', () => {
    expect(resolveTokenColors({ color: '#ff8800' }, def)).toEqual({
      stroke: '#ff8800',
      fill: '#ff880026',
      text: 'var(--dg-undeveloped-text)',
    });
  });

  it('honors explicit fill and text over the defaults/tint', () => {
    expect(resolveTokenColors({ fillColor: '#123456', textColor: '#abcdef' }, def)).toEqual({
      stroke: 'S',
      fill: '#123456',
      text: '#abcdef',
    });
  });
});

describe('tintFill', () => {
  it('appends 15% alpha', () => {
    expect(tintFill('#ff8800')).toBe('#ff880026');
  });
});
