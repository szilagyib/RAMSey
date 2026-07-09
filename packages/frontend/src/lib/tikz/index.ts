import type { Node, Edge } from '@xyflow/react';
import type { FMEARow } from '../../types/diagram';
import { wrapDocument } from './document';
import { markovToTikz } from './markov';
import { faultTreeToTikz } from './faultTree';
import { eventTreeToTikz } from './eventTree';
import { rbdToTikz } from './rbd';
import { bowTieToTikz } from './bowTie';
import { fmeaToTable } from './fmea';

type GraphSerializer = (nodes: Node[], edges: Edge[]) => string;

const SERIALIZERS: Record<string, GraphSerializer> = {
  markov_chain: markovToTikz,
  fault_tree: faultTreeToTikz,
  event_tree: eventTreeToTikz,
  reliability_block_diagram: rbdToTikz,
  bow_tie: bowTieToTikz,
};

/**
 * Build a compilable standalone LaTeX document for a diagram.
 * Graph types produce a TikZ picture; FMEA produces a booktabs table.
 */
export function generateLatex(
  diagramType: string,
  nodes: Node[],
  edges: Edge[],
  fmeaRows: FMEARow[] = [],
): string {
  if (diagramType === 'fmea') {
    return wrapDocument(fmeaToTable(fmeaRows), { packages: ['booktabs'] });
  }

  const serializer = SERIALIZERS[diagramType];
  if (!serializer) {
    throw new Error(`LaTeX export is not supported for diagram type '${diagramType}'`);
  }

  return wrapDocument(serializer(nodes, edges), { tikz: true });
}
