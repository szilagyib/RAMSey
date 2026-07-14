import { describe, it, expect } from 'vitest';
import { formatNodeSize, parseNodeSize } from '../../../src/lib/dragPayload';

// The size travels with the drag so the preview and the drop agree about it.
describe('drag payload size', () => {
  it('round-trips', () => {
    expect(parseNodeSize(formatNodeSize({ width: 112, height: 64 }))).toEqual({
      width: 112,
      height: 64,
    });
  });

  it('returns null for anything it cannot trust, so the drop falls back safely', () => {
    for (const bad of ['', null, undefined, 'abc', '0x10', '10x', 'NaNxNaN']) {
      expect(parseNodeSize(bad)).toBeNull();
    }
  });
});
