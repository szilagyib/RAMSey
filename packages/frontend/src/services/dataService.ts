import { api } from './api';
import { localDb } from './localDb';

// Module-level constants so getDataService is referentially stable: the same
// userId always yields the same object, making it safe to use in React hook
// dependency arrays without re-firing effects on every render.
const localService = { projects: localDb.projects, diagrams: localDb.diagrams };
const remoteService = { projects: api.projects, diagrams: api.diagrams };

export function getDataService(userId: string | undefined) {
  return userId?.startsWith('local:') ? localService : remoteService;
}
