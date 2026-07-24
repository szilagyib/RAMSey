import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { contentHash, type AnalysisMethod, type AnalysisOptions } from '@ramsey/engine';
import { authenticate } from '../middleware/authenticate.js';
import { requireProjectRole } from '../middleware/requireProjectRole.js';
import { AnalysisJobService } from '../services/analysis-job.service.js';
import { DiagramService } from '../services/diagram.service.js';
import { getAnalysisQueue, isServerAnalysisAvailable } from '../queue/analysisQueue.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const analyzeSchema = z.object({
  modelIR: z.record(z.string(), z.unknown()),
  method: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional().default({}),
});

const analysisRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const jobs = new AnalysisJobService(fastify.prisma);
  const diagrams = new DiagramService(fastify.prisma);

  /**
   * POST a server-side analysis job. The client supplies the ModelIR (built by
   * the frontend converters); the job is queued and computed by the solver-worker.
   */
  fastify.post<{ Params: { projectId: string; diagramId: string } }>(
    '/api/projects/:projectId/diagrams/:diagramId/analysis',
    { preHandler: [authenticate, requireProjectRole('viewer')] },
    async (request, reply) => {
      const parsed = analyzeSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid analysis request', parsed.error.flatten());
      }

      // Refuse when no worker is running, rather than queueing a job that
      // nothing will ever pick up.
      const queue = getAnalysisQueue();
      if (!queue || !isServerAnalysisAvailable()) {
        return reply.status(503).send({ message: 'Server-side analysis is not available' });
      }

      const { diagramId } = request.params;
      const diagram = await diagrams.findById(diagramId);
      if (!diagram) {
        throw new NotFoundError(`Diagram '${diagramId}' not found`);
      }

      const modelIR = parsed.data.modelIR as unknown as Parameters<typeof contentHash>[0];
      const job = await jobs.create({
        diagramId,
        requestedById: request.user!.id,
        contentHash: contentHash(modelIR),
        method: parsed.data.method,
        options: parsed.data.options,
      });

      await queue.enqueue({
        jobId: job.id,
        diagramId,
        modelIR,
        method: parsed.data.method as AnalysisMethod,
        options: parsed.data.options as AnalysisOptions,
      });

      reply.status(202);
      return { data: { jobId: job.id, status: job.status } };
    },
  );

  /** Poll a job's status and (when finished) its result. */
  fastify.get<{ Params: { projectId: string; diagramId: string; jobId: string } }>(
    '/api/projects/:projectId/diagrams/:diagramId/analysis/:jobId',
    { preHandler: [authenticate, requireProjectRole('viewer')] },
    async (request) => {
      const { diagramId, jobId } = request.params;
      const job = await jobs.getById(jobId);
      if (!job || job.diagramId !== diagramId) {
        throw new NotFoundError(`Analysis job '${jobId}' not found`);
      }

      const r = job.result;
      const result = r
        ? {
            status: 'success' as const,
            solver: { name: r.solverName, version: r.solverVersion },
            ...(r.results as object),
            numericMetadata: r.numericMetadata,
            trace: r.trace,
            warnings: r.warnings ?? [],
            errorBounds: r.errorBounds ?? {},
            computeTimeMs: r.computeTimeMs,
          }
        : null;

      return {
        data: {
          jobId: job.id,
          status: job.status,
          progress: job.progress,
          errorMessage: job.errorMessage,
          result,
        },
      };
    },
  );
};

export default analysisRoutes;
