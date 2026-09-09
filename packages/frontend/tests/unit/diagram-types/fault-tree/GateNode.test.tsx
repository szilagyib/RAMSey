import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';

// The handles are the only part of a node that needs React Flow's context; the
// shape and its styling do not, so stub them and render the node on its own.
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Handle: () => null,
}));

import { GateNode } from '../../../../src/diagram-types/fault-tree/nodes/GateNode';

afterEach(cleanup);

const gate = (data: Record<string, unknown>) =>
  render(
    <GateNode
      {...({ id: 'g1', type: 'gateNode', selected: false, data } as unknown as NodeProps)}
    />,
  );

/** The style the gate hands down to the shapes inside it. */
const wrapperStyle = (container: HTMLElement) =>
  (container.querySelector('div.relative') as HTMLElement | null)?.style;

// Opacity fades a node's fill and nothing else. On a gate it is inherited by
// the SVG shapes through the wrapper, and it used to be written only when the
// node ALSO carried a custom colour — hasCustomColor looks at border/fill/text
// and knows nothing about opacity — so fading a gate silently did nothing
// unless it happened to be recoloured too.
describe('GateNode opacity', () => {
  it('fades the fill when only opacity is set', () => {
    const { container } = gate({ label: 'G1', gateType: 'AND', opacity: 0.3 });
    expect(wrapperStyle(container)?.fillOpacity).toBe('0.3');
  });

  it('still fades when the gate is also recoloured', () => {
    const { container } = gate({
      label: 'G1',
      gateType: 'AND',
      opacity: 0.3,
      color: '#ef4444',
    });
    expect(wrapperStyle(container)?.fillOpacity).toBe('0.3');
  });

  it('writes no fill-opacity for a fully opaque gate', () => {
    const { container } = gate({ label: 'G1', gateType: 'AND' });
    expect(wrapperStyle(container)?.fillOpacity).toBeFalsy();
  });
});
