/**
 * How the property panel should present each field of a node's or edge's data.
 *
 * The panel is generic — it reflects over whatever keys the data carries — which
 * is what keeps a new diagram type from needing its own panel. But a raw
 * reflection shows `stateType` as a free-text box, and typing "operatonal" into
 * it silently produces a node the solver reads as something else. So the keys
 * that carry meaning are declared here.
 */

/** Fields whose value the node redraws itself from. */
export const ENUM_OPTIONS: Record<string, readonly string[]> = {
  // Markov: every state is a `stateNode`, which picks its colour and its
  // absorbing double-ring from this.
  stateType: ['operational', 'degraded', 'failed', 'absorbing'],
  // Fault tree: every event is an `eventNode`, which picks its symbol from this.
  eventType: ['basic', 'intermediate', 'top', 'undeveloped'],
  // Fault tree: every gate is a `gateNode`, which picks its symbol from this.
  gateType: ['AND', 'OR', 'NOT', 'K_OF_N', 'XOR'],
  // Event tree: the branch's colour and success/failure convention.
  branchType: ['success', 'failure'],
};

/**
 * Fields that are shown but cannot be edited.
 *
 * `nodeKind` selects *which component renders the node* — a gate and an event
 * are different components, as are a block and a terminal. Changing the data
 * alone would leave the node's type pointing at the old component, and its data
 * missing the fields the new one needs. To change a node's kind, delete it and
 * drag the one you want. Showing it read-only beats hiding it: it's the field
 * that tells you what you selected.
 */
export const READONLY_FIELDS: ReadonlySet<string> = new Set(['nodeKind']);

/** Never rendered as a field: handled by dedicated controls or internal. */
export const HIDDEN_FIELDS: ReadonlySet<string> = new Set([
  'color',
  'fillColor',
  'textColor',
  'cpX',
  'cpY',
]);

const LABELS: Record<string, string> = {
  label: 'Label',
  description: 'Description',
  probability: 'Probability',
  rate: 'Rate',
  stateType: 'State type',
  isInitial: 'Initial state',
  nodeKind: 'Kind',
  eventType: 'Event type',
  gateType: 'Gate type',
  branchType: 'Branch type',
  k: 'k (of n inputs)',
  failureRate: 'Failure rate (λ)',
  repairRate: 'Repair rate (μ)',
  effectiveness: 'Effectiveness',
};

/** `failureRate` → "Failure rate"; `node_kind` → "Node kind". */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The label to show above a field. */
export function fieldLabel(key: string): string {
  return LABELS[key] ?? humanizeKey(key);
}

const OPTION_LABELS: Record<string, string> = { K_OF_N: 'K of N' };

/** `input_terminal` → "Input terminal"; `AND` → "AND"; `K_OF_N` → "K of N". */
export function optionLabel(value: string): string {
  if (OPTION_LABELS[value]) return OPTION_LABELS[value];
  if (/^[A-Z0-9]+$/.test(value)) return value; // AND, OR, NOT, XOR
  return humanizeKey(value);
}
