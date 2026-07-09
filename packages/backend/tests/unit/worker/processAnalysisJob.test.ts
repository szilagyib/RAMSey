import { describe, it, expect, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { mockPrismaClient, type MockPrismaClient } from '../../helpers/setup.js';
import { processAnalysisJob } from '../../../src/worker/processAnalysisJob.js';
import type { AnalysisJobPayload } from '../../../src/queue/analysisQueue.js';

const markovIR = {
  version: '1.0.0',
  type: 'markov_chain',
  unitConfig: { timeBase: 'hours', rateBase: '1/h' },
  components: [],
  events: [],
  gates: [],
  states: [
    { id: 'S0', label: 'Up', type: 'operational' },
    { id: 'S1', label: 'Down', type: 'failed' },
  ],
  transitions: [
    { id: 't0', from: 'S0', to: 'S1', rate: 0.001 },
    { id: 't1', from: 'S1', to: 'S0', rate: 0.01 },
  ],
  blocks: [],
  barriers: [],
  dependencies: [],
  parameters: [],
  distributions: [],
  initialCondition: { type: 'single', stateId: 'S0' },
  missionTime: 1000,
  repairPolicy: null,
};

const payload: AnalysisJobPayload = {
  jobId: 'job-1',
  diagramId: 'diag-1',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelIR: markovIR as any,
  method: 'availability',
  options: {},
};

describe('processAnalysisJob', () => {
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = mockPrismaClient();
    prisma.analysisJob.findUnique.mockResolvedValue({
      id: 'job-1',
      diagramId: 'diag-1',
      contentHash: 'hash-1',
      method: 'availability',
      options: {},
      requestedById: 'user-1',
    });
  });

  it('runs the engine, persists the result, and marks the job COMPLETED', async () => {
    await processAnalysisJob(payload, prisma as unknown as PrismaClient);

    // Result persisted with the correct availability (μ/(λ+μ) = 0.01/0.011).
    expect(prisma.analysisResult.upsert).toHaveBeenCalledOnce();
    const upsertArg = prisma.analysisResult.upsert.mock.calls[0][0];
    const metrics = upsertArg.create.results.metrics as Record<string, number>;
    expect(Math.abs(metrics.availability - 0.01 / 0.011)).toBeLessThan(1e-6);
    expect(upsertArg.create.method).toBe('availability');
    expect(upsertArg.create.executedOn).toBe('SERVER_NATIVE');

    // Job transitioned RUNNING → COMPLETED.
    const statuses = prisma.analysisJob.update.mock.calls.map((c) => c[0].data.status);
    expect(statuses).toContain('RUNNING');
    expect(statuses).toContain('COMPLETED');

    // The requester is notified of completion.
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', type: 'ANALYSIS_COMPLETE' }),
      }),
    );
  });

  it('marks the job FAILED when the engine returns an error', async () => {
    prisma.analysisJob.findUnique.mockResolvedValue({
      id: 'job-1',
      diagramId: 'diag-1',
      contentHash: 'hash-1',
      method: 'mttf', // no absorbing state → error
      options: {},
      requestedById: 'user-1',
    });
    await processAnalysisJob({ ...payload, method: 'mttf' }, prisma as unknown as PrismaClient);

    expect(prisma.analysisResult.upsert).not.toHaveBeenCalled();
    const statuses = prisma.analysisJob.update.mock.calls.map((c) => c[0].data.status);
    expect(statuses).toContain('FAILED');

    // The requester is notified of the failure.
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', type: 'ANALYSIS_FAILED' }),
      }),
    );
  });

  it('no-ops when the job row is missing', async () => {
    prisma.analysisJob.findUnique.mockResolvedValue(null);
    await processAnalysisJob(payload, prisma as unknown as PrismaClient);
    expect(prisma.analysisJob.update).not.toHaveBeenCalled();
  });
});
