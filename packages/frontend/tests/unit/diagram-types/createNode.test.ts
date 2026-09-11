import { describe, it, expect } from 'vitest';
import { getDiagramTypeConfig } from '../../../src/diagram-types/registry';

// The AI assistant names node sub-types, and a model will sometimes name one the
// diagram does not have — "or" for "or_gate", "barrier" for "preventive_barrier".
// Each factory already fell back to the default *component* for an unknown name,
// but not to the default *data*, so the node was drawn as one kind while carrying
// no kind at all: the fault tree threw outright, the RBD quietly left the block
// out of its analysis, the bow-tie solver passed it straight through, and the
// LaTeX export crashed or wrote a document that would not compile.
const TYPES = ['markov_chain', 'fault_tree', 'event_tree', 'reliability_block_diagram', 'bow_tie'];

describe.each(TYPES)('%s createNode', (type) => {
  const config = getDiagramTypeConfig(type)!;
  const at = { x: 10, y: 20 };

  it('creates the default node for a sub-type it does not know', () => {
    expect(config.createNode(at, 3, 'no_such_kind')).toEqual(config.createNode(at, 3));
  });

  // `in` answers yes to these: they are inherited from Object.prototype.
  it.each(['constructor', 'toString'])('does not take the inherited %s for a sub-type', (name) => {
    expect(config.createNode(at, 3, name)).toEqual(config.createNode(at, 3));
  });

  // The guard against the fix itself: falling back must not swallow the
  // sub-types that do exist.
  it('still gives every sidebar sub-type its own kind', () => {
    const kinds = config.sidebarItems.map((item) =>
      JSON.stringify(config.createNode(at, 3, item.type).data),
    );
    expect(new Set(kinds).size).toBe(config.sidebarItems.length);
  });
});
