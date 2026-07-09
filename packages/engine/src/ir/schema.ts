// ---------------------------------------------------------------------------
// ValueRef — a numeric value, a named parameter reference, or an expression
// ---------------------------------------------------------------------------

export type ValueRef = number | { param: string } | { expr: string };

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export interface UnitConfig {
  timeBase: 'hours' | 'days' | 'years';
  rateBase: '1/h' | '1/d' | '1/y';
}

// ---------------------------------------------------------------------------
// Diagram types supported by the engine
// ---------------------------------------------------------------------------

export type DiagramType =
  | 'markov_chain'
  | 'fault_tree'
  | 'event_tree'
  | 'reliability_block_diagram'
  | 'bow_tie'
  | 'fmea';

// ---------------------------------------------------------------------------
// Top-level intermediate representation
// ---------------------------------------------------------------------------

export interface ModelIR {
  version: string;
  type: DiagramType;
  unitConfig: UnitConfig;
  components: Component[];
  events: Event[];
  gates: Gate[];
  states: State[];
  transitions: Transition[];
  blocks: Block[];
  barriers: Barrier[];
  dependencies: Dependency[];
  parameters: Parameter[];
  distributions: Distribution[];
  initialCondition: InitialCondition | null;
  missionTime: ValueRef;
  repairPolicy: RepairPolicy | null;
  /**
   * Optional general two-terminal network for reliability block diagrams.
   * When present, the RBD solver computes reliability over this network (any
   * topology, incl. non-series-parallel) instead of the nested `blocks`.
   */
  rbdNetwork?: RbdNetwork;
  /** Optional event-tree structure consumed by the event-tree solver. */
  eventTree?: EventTreeStructure;
  /** Optional bow-tie structure consumed by the bow-tie solver. */
  bowTie?: BowTieStructure;
}

/**
 * A two-terminal RBD network: components (in `components`) wired by directed
 * connections from `source` to `sink`. Connection endpoints are component ids
 * or the terminal ids; terminals are perfect (reliability 1) pass-throughs.
 */
export interface RbdNetwork {
  source: string;
  sink: string;
  connections: { from: string; to: string }[];
}

/**
 * Event-tree structure: branches fan out from the initiating event through
 * pivotal events to consequences. Each branch carries its conditional
 * probability; a consequence is any node with no outgoing branch.
 */
export interface EventTreeStructure {
  initiatingId: string;
  /** Frequency or probability of the initiating event (default 1). */
  initiatingProbability?: ValueRef;
  branches: { from: string; to: string; probability?: ValueRef; branchType?: string }[];
  /** Node id → display label, used to report consequence outcomes. */
  labels?: Record<string, string>;
}

export type BowTieNodeKind =
  | 'threat'
  | 'preventive_barrier'
  | 'top_event'
  | 'mitigative_barrier'
  | 'consequence';

/**
 * Bow-tie structure: threats reach the top event through preventive barriers;
 * the top event escalates to consequences through mitigative barriers. Barriers
 * carry an `effectiveness` (probability of stopping propagation).
 */
export interface BowTieStructure {
  topEventId: string;
  nodes: { id: string; kind: BowTieNodeKind; effectiveness?: ValueRef; probability?: ValueRef }[];
  edges: { from: string; to: string }[];
  labels?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface Component {
  id: string;
  name: string;
  failureRate?: ValueRef;
  repairRate?: ValueRef;
  distribution?: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// State (Markov chain nodes)
// ---------------------------------------------------------------------------

export type StateType = 'operational' | 'degraded' | 'failed' | 'absorbing';

export interface State {
  id: string;
  label: string;
  type: StateType;
  position?: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Initial condition
// ---------------------------------------------------------------------------

export type InitialCondition =
  | { type: 'single'; stateId: string }
  | { type: 'distribution'; probabilities: Record<string, number> };

// ---------------------------------------------------------------------------
// Transition (Markov chain edges)
// ---------------------------------------------------------------------------

export interface Transition {
  id: string;
  from: string;
  to: string;
  rate?: ValueRef;
  probability?: ValueRef;
  label?: string;
  condition?: string;
}

// ---------------------------------------------------------------------------
// Gate (fault tree / event tree logic)
// ---------------------------------------------------------------------------

export type GateType = 'AND' | 'OR' | 'NOT' | 'K_OF_N' | 'XOR';

export interface Gate {
  id: string;
  type: GateType;
  k?: number;
  inputs: string[];
  output: string;
}

// ---------------------------------------------------------------------------
// Parameter
// ---------------------------------------------------------------------------

export interface Parameter {
  name: string;
  value: number;
  unit: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Distribution
// ---------------------------------------------------------------------------

export type DistributionType = 'exponential' | 'weibull' | 'lognormal' | 'constant';

export interface Distribution {
  id: string;
  type: DistributionType;
  params: Record<string, ValueRef>;
}

// ---------------------------------------------------------------------------
// Dependencies (discriminated union)
// ---------------------------------------------------------------------------

export interface CommonCauseFailure {
  kind: 'common_cause_failure';
  id: string;
  name: string;
  affectedComponents: string[];
  beta: ValueRef;
  model: 'beta_factor' | 'mgl' | 'alpha_factor';
}

export interface FunctionalDependency {
  kind: 'functional_dependency';
  id: string;
  trigger: string;
  dependents: string[];
}

export interface ConditionalProbability {
  kind: 'conditional_probability';
  id: string;
  event: string;
  givenEvent: string;
  probability: ValueRef;
}

export interface InhibitCondition {
  kind: 'inhibit_condition';
  id: string;
  gate: string;
  condition: string;
  probability: ValueRef;
}

export type Dependency =
  | CommonCauseFailure
  | FunctionalDependency
  | ConditionalProbability
  | InhibitCondition;

// ---------------------------------------------------------------------------
// Repair policy
// ---------------------------------------------------------------------------

export type RepairPolicyType =
  | 'unlimited'
  | 'single_repairman'
  | 'priority_queue'
  | 'k_repairmen';

export interface RepairPolicy {
  type: RepairPolicyType;
  maxSimultaneousRepairs?: number;
  priorityOrder?: string[];
  preemptive?: boolean;
}

// ---------------------------------------------------------------------------
// Barrier (bow-tie diagrams)
// ---------------------------------------------------------------------------

export type BarrierType = 'preventive' | 'mitigative';

export interface Barrier {
  id: string;
  name: string;
  type: BarrierType;
  effectiveness: ValueRef;
}

// ---------------------------------------------------------------------------
// Block (reliability block diagrams)
// ---------------------------------------------------------------------------

export type BlockType = 'series' | 'parallel' | 'k_of_n';

export interface Block {
  id: string;
  name: string;
  type: BlockType;
  k?: number;
  children: string[];
}

// ---------------------------------------------------------------------------
// Event (fault tree / event tree)
// ---------------------------------------------------------------------------

export type EventType = 'basic' | 'intermediate' | 'top' | 'undeveloped';

export interface Event {
  id: string;
  name: string;
  probability?: ValueRef;
  type: EventType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a default, empty ModelIR for the given diagram type.
 * All arrays are empty and optional fields are set to sensible defaults.
 */
export function createDefaultModelIR(type: DiagramType): ModelIR {
  return {
    version: '1.0.0',
    type,
    unitConfig: {
      timeBase: 'hours',
      rateBase: '1/h',
    },
    components: [],
    events: [],
    gates: [],
    states: [],
    transitions: [],
    blocks: [],
    barriers: [],
    dependencies: [],
    parameters: [],
    distributions: [],
    initialCondition: null,
    missionTime: 8760,
    repairPolicy: null,
  };
}

/**
 * Create a default ModelIR pre-configured for Markov chain analysis.
 * Includes a single operational state with a matching initial condition
 * and an unlimited repair policy.
 */
export function createDefaultMarkovIR(): ModelIR {
  const ir = createDefaultModelIR('markov_chain');

  ir.states = [
    {
      id: 'S0',
      label: 'Operational',
      type: 'operational',
      position: { x: 0, y: 0 },
    },
  ];

  ir.initialCondition = {
    type: 'single',
    stateId: 'S0',
  };

  ir.repairPolicy = {
    type: 'unlimited',
  };

  return ir;
}
