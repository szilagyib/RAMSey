import type { Node, Edge, NodeTypes, EdgeTypes } from '@xyflow/react';
import type { DiagramType, ValidationResult } from '@ramsey/engine';

// Markov Chain
import { nodeTypes as markovNodeTypes, edgeTypes as markovEdgeTypes } from './markov-chain';
import {
  createNode as markovCreateNode,
  createEdge as markovCreateEdge,
} from './markov-chain/defaults';
import { validateMarkovDiagram } from './markov-chain/validation';

// Fault Tree
import { nodeTypes as ftNodeTypes, edgeTypes as ftEdgeTypes } from './fault-tree';
import { createNode as ftCreateNode, createEdge as ftCreateEdge } from './fault-tree/defaults';
import { validate as ftValidate } from './fault-tree/validation';

// Event Tree
import { nodeTypes as etNodeTypes, edgeTypes as etEdgeTypes } from './event-tree';
import { createNode as etCreateNode, createEdge as etCreateEdge } from './event-tree/defaults';
import { validate as etValidate } from './event-tree/validation';

// RBD
import { nodeTypes as rbdNodeTypes, edgeTypes as rbdEdgeTypes } from './rbd';
import { createNode as rbdCreateNode, createEdge as rbdCreateEdge } from './rbd/defaults';
import { validate as rbdValidate } from './rbd/validation';

// Bow-Tie
import { nodeTypes as btNodeTypes, edgeTypes as btEdgeTypes } from './bow-tie';
import { createNode as btCreateNode, createEdge as btCreateEdge } from './bow-tie/defaults';
import { validate as btValidate } from './bow-tie/validation';

// FMEA
import { nodeTypes as fmeaNodeTypes, edgeTypes as fmeaEdgeTypes } from './fmea';

// ---------------------------------------------------------------------------
// Sidebar item
// ---------------------------------------------------------------------------

export interface SidebarItem {
  type: string;
  label: string;
  group?: string;
  colorClass?: string;
  borderClass?: string;
  /**
   * The size this node actually renders at, in flow units.
   *
   * Used for two things that must agree: the drag preview (so what you see is
   * the size you'll get) and centring the node on the cursor when you drop it.
   * Measured from the real components — e2e/drop.spec.ts re-measures every node
   * type and fails if these drift.
   */
  size?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Diagram type config
// ---------------------------------------------------------------------------

export interface DiagramTypeConfig {
  id: DiagramType;
  name: string;
  description: string;
  nodeTypes: NodeTypes;
  edgeTypes: EdgeTypes;
  sidebarItems: SidebarItem[];
  createNode: (position: { x: number; y: number }, counter: number, subType?: string) => Node;
  createEdge: (source: string, target: string, counter: number, subType?: string) => Edge;
  validate: (nodes: Node[], edges: Edge[]) => ValidationResult;
  defaultEdgeType?: string;
  isTableBased?: boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry: Record<string, DiagramTypeConfig> = {
  markov_chain: {
    id: 'markov_chain',
    name: 'Markov Chain',
    description: 'State-transition diagram with probabilistic edges',
    nodeTypes: markovNodeTypes,
    edgeTypes: markovEdgeTypes,
    sidebarItems: [
      {
        type: 'operational',
        label: 'Operational',
        group: 'States',
        colorClass: 'bg-green-500',
        borderClass: 'border-green-500',
        size: { width: 48, height: 48 },
      },
      {
        type: 'degraded',
        label: 'Degraded',
        group: 'States',
        colorClass: 'bg-yellow-500',
        borderClass: 'border-yellow-500',
        size: { width: 48, height: 48 },
      },
      {
        type: 'failed',
        label: 'Failed',
        group: 'States',
        colorClass: 'bg-red-500',
        borderClass: 'border-red-500',
        size: { width: 48, height: 48 },
      },
      {
        type: 'absorbing',
        label: 'Absorbing',
        group: 'States',
        colorClass: 'bg-gray-500',
        borderClass: 'border-gray-500',
        size: { width: 58, height: 58 },
      },
    ],
    createNode: markovCreateNode,
    createEdge: markovCreateEdge,
    validate: validateMarkovDiagram,
    defaultEdgeType: 'transitionEdge',
  },

  fault_tree: {
    id: 'fault_tree',
    name: 'Fault Tree',
    description: 'Top-down logic diagram for failure analysis',
    nodeTypes: ftNodeTypes,
    edgeTypes: ftEdgeTypes,
    sidebarItems: [
      {
        type: 'and_gate',
        label: 'AND Gate',
        group: 'Gates',
        colorClass: 'bg-blue-500',
        borderClass: 'border-blue-500',
        size: { width: 48, height: 64 },
      },
      {
        type: 'or_gate',
        label: 'OR Gate',
        group: 'Gates',
        colorClass: 'bg-blue-400',
        borderClass: 'border-blue-500',
        size: { width: 48, height: 64 },
      },
      {
        type: 'not_gate',
        label: 'NOT Gate',
        group: 'Gates',
        colorClass: 'bg-blue-300',
        borderClass: 'border-blue-500',
        size: { width: 48, height: 64 },
      },
      {
        type: 'k_of_n_gate',
        label: 'K/N Gate',
        group: 'Gates',
        colorClass: 'bg-blue-600',
        borderClass: 'border-blue-500',
        size: { width: 48, height: 64 },
      },
      {
        type: 'xor_gate',
        label: 'XOR Gate',
        group: 'Gates',
        colorClass: 'bg-blue-700',
        borderClass: 'border-blue-500',
        size: { width: 48, height: 64 },
      },
      {
        type: 'basic_event',
        label: 'Basic Event',
        group: 'Events',
        colorClass: 'bg-green-500',
        borderClass: 'border-green-500',
        size: { width: 48, height: 65 },
      },
      {
        type: 'intermediate_event',
        label: 'Intermediate',
        group: 'Events',
        colorClass: 'bg-yellow-500',
        borderClass: 'border-yellow-500',
        size: { width: 128, height: 48 },
      },
      {
        type: 'top_event',
        label: 'Top Event',
        group: 'Events',
        colorClass: 'bg-red-500',
        borderClass: 'border-red-500',
        size: { width: 128, height: 48 },
      },
      {
        type: 'undeveloped_event',
        label: 'Undeveloped',
        group: 'Events',
        colorClass: 'bg-gray-400',
        borderClass: 'border-gray-500',
        size: { width: 48, height: 65 },
      },
    ],
    createNode: ftCreateNode,
    createEdge: ftCreateEdge,
    validate: ftValidate,
    defaultEdgeType: 'treeEdge',
  },

  event_tree: {
    id: 'event_tree',
    name: 'Event Tree',
    description: 'Left-to-right branching analysis of event sequences',
    nodeTypes: etNodeTypes,
    edgeTypes: etEdgeTypes,
    sidebarItems: [
      {
        type: 'initiating_event',
        label: 'Initiating Event',
        group: 'Events',
        colorClass: 'bg-orange-500',
        borderClass: 'border-orange-500',
        size: { width: 128, height: 48 },
      },
      {
        type: 'header',
        label: 'Header',
        group: 'Branch Points',
        colorClass: 'bg-blue-500',
        borderClass: 'border-blue-500',
        size: { width: 128, height: 48 },
      },
      {
        type: 'consequence',
        label: 'Consequence',
        group: 'Outcomes',
        colorClass: 'bg-green-500',
        borderClass: 'border-green-500',
        size: { width: 112, height: 48 },
      },
    ],
    createNode: etCreateNode,
    createEdge: etCreateEdge,
    validate: etValidate,
    defaultEdgeType: 'branchEdge',
  },

  reliability_block_diagram: {
    id: 'reliability_block_diagram',
    name: 'Reliability Block Diagram',
    description: 'System reliability model using series/parallel blocks',
    nodeTypes: rbdNodeTypes,
    edgeTypes: rbdEdgeTypes,
    sidebarItems: [
      {
        type: 'block',
        label: 'Block',
        group: 'Components',
        colorClass: 'bg-blue-500',
        borderClass: 'border-blue-500',
        size: { width: 112, height: 64 },
      },
      {
        type: 'input_terminal',
        label: 'Input Terminal',
        group: 'Terminals',
        colorClass: 'bg-green-500',
        borderClass: 'border-green-500',
        size: { width: 48, height: 48 },
      },
      {
        type: 'output_terminal',
        label: 'Output Terminal',
        group: 'Terminals',
        colorClass: 'bg-red-500',
        borderClass: 'border-red-500',
        size: { width: 48, height: 48 },
      },
    ],
    createNode: rbdCreateNode,
    createEdge: rbdCreateEdge,
    validate: rbdValidate,
    defaultEdgeType: 'connectionEdge',
  },

  bow_tie: {
    id: 'bow_tie',
    name: 'Bow-Tie',
    description: 'Threats through barriers to top event and consequences',
    nodeTypes: btNodeTypes,
    edgeTypes: btEdgeTypes,
    sidebarItems: [
      {
        type: 'threat',
        label: 'Threat',
        group: 'Threats',
        colorClass: 'bg-red-500',
        borderClass: 'border-red-500',
        size: { width: 112, height: 48 },
      },
      {
        type: 'preventive_barrier',
        label: 'Preventive Barrier',
        group: 'Barriers',
        colorClass: 'bg-blue-500',
        borderClass: 'border-blue-500',
        size: { width: 32, height: 80 },
      },
      {
        type: 'top_event',
        label: 'Top Event',
        group: 'Central Event',
        colorClass: 'bg-amber-500',
        borderClass: 'border-amber-500',
        size: { width: 80, height: 80 },
      },
      {
        type: 'mitigative_barrier',
        label: 'Mitigative Barrier',
        group: 'Barriers',
        colorClass: 'bg-green-500',
        borderClass: 'border-green-500',
        size: { width: 32, height: 80 },
      },
      {
        type: 'consequence',
        label: 'Consequence',
        group: 'Consequences',
        colorClass: 'bg-purple-500',
        borderClass: 'border-purple-500',
        size: { width: 112, height: 48 },
      },
    ],
    createNode: btCreateNode,
    createEdge: btCreateEdge,
    validate: btValidate,
    defaultEdgeType: 'flowEdge',
  },

  fmea: {
    id: 'fmea',
    name: 'FMEA',
    description: 'Failure Mode and Effects Analysis table',
    nodeTypes: fmeaNodeTypes,
    edgeTypes: fmeaEdgeTypes,
    sidebarItems: [],
    createNode: () => ({ id: '', position: { x: 0, y: 0 }, data: {} }),
    createEdge: () => ({ id: '', source: '', target: '', data: {} }),
    validate: () => ({ valid: true, errors: [], warnings: [] }),
    isTableBased: true,
  },
};

export function getDiagramTypeConfig(type: string): DiagramTypeConfig | undefined {
  return registry[type];
}

export function getAllDiagramTypes(): DiagramTypeConfig[] {
  return Object.values(registry);
}
