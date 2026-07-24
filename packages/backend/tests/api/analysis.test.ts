import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestApp,
  createMockProject,
  createMockDiagram,
  authHeaders,
  type MockPrismaClient,
} from '../helpers/setup.js';
import { setAnalysisQueue, type AnalysisJobPayload } from '../../src/queue/analysisQueue.js';

const projectId = '00000000-0000-4000-8000-0000000000d1';
const diagramId = '00000000-0000-4000-8000-0000000000d2';
const url = `/api/projects/${projectId}/diagrams/${diagramId}/analysis`;
const json = { 'content-type': 'application/json' };

const body = {
  modelIR: { version: '1.0.0', type: 'markov_chain', states: [], transitions: [] },
  method: 'availability',
  options: {},
};

describe('Analysis job route', () => {
  let app: FastifyInstance;
  let prisma: MockPrismaClient;
  const enqueued: AnalysisJobPayload[] = [];

  // Injecting a queue stands in for a deployed solver-worker; the flag is what
  // tells the API one is actually running (see isServerAnalysisAvailable).
  const savedWorkerFlag = process.env.SOLVER_WORKER_ENABLED;

  beforeAll(async () => {
    process.env.SOLVER_WORKER_ENABLED = 'true';
    const r = await createTestApp();
    app = r.app;
    prisma = r.prisma;
  });

  afterAll(async () => {
    await app.close();
    setAnalysisQueue(null);
    if (savedWorkerFlag === undefined) delete process.env.SOLVER_WORKER_ENABLED;
    else process.env.SOLVER_WORKER_ENABLED = savedWorkerFlag;
  });

  beforeEach(() => {
    enqueued.length = 0;
    setAnalysisQueue({
      enqueue: async (p) => {
        enqueued.push(p);
      },
    });
    // Caller owns the project (default authHeaders user owns default mock projects).
    prisma.project.findUnique.mockResolvedValue(createMockProject({ id: projectId }));
    prisma.projectShare.findFirst.mockResolvedValue(null);
    prisma.diagram.findUnique.mockResolvedValue(createMockDiagram({ id: diagramId, projectId }));
    prisma.analysisJob.create.mockResolvedValue({ id: 'job-1', status: 'QUEUED' });
  });

  it('creates a job and enqueues it (202)', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { ...authHeaders(), ...json },
      payload: body,
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().data.jobId).toBe('job-1');
    expect(prisma.analysisJob.create).toHaveBeenCalledOnce();
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({ jobId: 'job-1', diagramId, method: 'availability' });
  });

  it('returns 503 when the queue is unavailable', async () => {
    setAnalysisQueue(null);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { ...authHeaders(), ...json },
      payload: body,
    });
    expect(res.statusCode).toBe(503);
  });

  // A queue exists whenever pg-boss reaches Postgres, but with no worker
  // deployed the job would sit QUEUED forever — refuse instead of accepting it.
  it('returns 503 when no solver worker is declared, even with a queue', async () => {
    process.env.SOLVER_WORKER_ENABLED = 'false';
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeaders(), ...json },
        payload: body,
      });
      expect(res.statusCode).toBe(503);
    } finally {
      process.env.SOLVER_WORKER_ENABLED = 'true';
    }
  });

  it('returns 400 for an invalid request body', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { ...authHeaders(), ...json },
      payload: { method: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the diagram does not exist', async () => {
    prisma.diagram.findUnique.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { ...authHeaders(), ...json },
      payload: body,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns job status with the mapped result when complete', async () => {
    prisma.analysisJob.findUnique.mockResolvedValue({
      id: 'job-1',
      diagramId,
      status: 'COMPLETED',
      progress: 1,
      errorMessage: null,
      result: {
        solverName: 'markov-solver',
        solverVersion: '0.1.0',
        results: { metrics: { availability: 0.9 }, contributions: {} },
        numericMetadata: { method: 'linear-system' },
        trace: { assumptions: [] },
        warnings: [],
        errorBounds: {},
        computeTimeMs: 5,
      },
    });
    const res = await app.inject({ method: 'GET', url: `${url}/job-1`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.status).toBe('COMPLETED');
    expect(data.result.status).toBe('success');
    expect(data.result.metrics.availability).toBe(0.9);
  });

  it('returns 404 for an unknown job', async () => {
    prisma.analysisJob.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: `${url}/nope`, headers: authHeaders() });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when the job belongs to another diagram', async () => {
    prisma.analysisJob.findUnique.mockResolvedValue({
      id: 'job-1',
      diagramId: 'other',
      status: 'QUEUED',
      progress: 0,
      errorMessage: null,
      result: null,
    });
    const res = await app.inject({ method: 'GET', url: `${url}/job-1`, headers: authHeaders() });
    expect(res.statusCode).toBe(404);
  });
});
