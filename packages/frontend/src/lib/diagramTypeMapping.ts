// Maps between backend SCREAMING_CASE and engine/frontend snake_case

const backendToEngine: Record<string, string> = {
  MARKOV_CHAIN: 'markov_chain',
  FAULT_TREE: 'fault_tree',
  EVENT_TREE: 'event_tree',
  RELIABILITY_BLOCK: 'reliability_block_diagram',
  BOW_TIE: 'bow_tie',
  FMEA: 'fmea',
  CUSTOM: 'markov_chain',
};

const engineToBackend: Record<string, string> = {
  markov_chain: 'MARKOV_CHAIN',
  fault_tree: 'FAULT_TREE',
  event_tree: 'EVENT_TREE',
  reliability_block_diagram: 'RELIABILITY_BLOCK',
  bow_tie: 'BOW_TIE',
  fmea: 'FMEA',
};

export function toEngineType(backendType: string): string {
  return backendToEngine[backendType] ?? 'markov_chain';
}

export function toBackendType(engineType: string): string {
  return engineToBackend[engineType] ?? 'MARKOV_CHAIN';
}
