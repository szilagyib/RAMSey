import { PgBoss } from 'pg-boss';
import { ANALYSIS_QUEUE, type AnalysisJobPayload, type AnalysisQueue } from './analysisQueue.js';
import { limits } from '../config/limits.js';

// ---------------------------------------------------------------------------
// pg-boss (Postgres-backed) implementation of the analysis queue. Shared by the
// API process (enqueue) and the solver-worker process (work).
// ---------------------------------------------------------------------------

let boss: PgBoss | null = null;

/** Start a singleton pg-boss bound to the given Postgres connection string. */
export async function startPgBoss(connectionString: string): Promise<PgBoss> {
  if (boss) return boss;
  boss = new PgBoss({ connectionString });
  boss.on('error', () => {
    /* pg-boss surfaces transient errors here; swallow to avoid crashing */
  });
  await boss.start();
  await boss.createQueue(ANALYSIS_QUEUE);
  return boss;
}

export async function stopPgBoss(): Promise<void> {
  await boss?.stop();
  boss = null;
}

/** Build the queue adapter used by routes. */
export function createPgBossQueue(instance: PgBoss): AnalysisQueue {
  return {
    async enqueue(payload: AnalysisJobPayload): Promise<void> {
      await instance.send(ANALYSIS_QUEUE, payload, {
        // Retry transient/infra failures (DB blip, worker crash mid-run) with
        // backoff. Deterministic analysis errors are caught in the worker and
        // recorded as FAILED — they return normally, so pg-boss won't retry them.
        // The expiry caps a single attempt so a hung solver is reclaimed.
        retryLimit: limits.worker.retryLimit,
        retryDelay: limits.worker.retryDelaySeconds,
        retryBackoff: limits.worker.retryBackoff,
        expireInSeconds: limits.worker.expireInSeconds,
      });
    },
  };
}
