import type { PrismaClient } from '@prisma/client';
import { analyze } from '@ramsey/engine';
import type { AnalysisJobPayload } from '../queue/analysisQueue.js';
import { NotificationService } from '../services/notification.service.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Process one analysis job: run the engine, persist the AnalysisResult, and
// flip the AnalysisJob status. Pure over its Prisma dependency, so it can be
// unit-tested without a queue/worker runtime.
// ---------------------------------------------------------------------------

export async function processAnalysisJob(
  payload: AnalysisJobPayload,
  prisma: PrismaClient,
): Promise<void> {
  const notifications = new NotificationService(prisma);
  const job = await prisma.analysisJob.findUnique({ where: { id: payload.jobId } });
  if (!job) {
    logger.warn({ jobId: payload.jobId }, 'analysis job vanished before processing');
    return;
  }
  logger.info(
    { jobId: job.id, diagramId: job.diagramId, method: job.method },
    'analysis job started',
  );

  await prisma.analysisJob.update({
    where: { id: payload.jobId },
    data: { status: 'RUNNING', startedAt: new Date(), progress: 0 },
  });

  try {
    const response = await analyze({
      modelIR: payload.modelIR,
      method: payload.method,
      options: payload.options,
      executionTarget: 'server',
    });

    if (response.status === 'error') {
      const errorMessage = response.warnings[0]?.message ?? 'Analysis error';
      await prisma.analysisJob.update({
        where: { id: payload.jobId },
        data: { status: 'FAILED', finishedAt: new Date(), errorMessage },
      });
      logger.warn(
        { jobId: job.id, method: job.method, errorMessage },
        'analysis job failed (engine error)',
      );
      await notifications.create({
        userId: job.requestedById,
        type: 'ANALYSIS_FAILED',
        payload: {
          jobId: job.id,
          diagramId: job.diagramId,
          method: job.method,
          error: errorMessage,
        },
      });
      return;
    }

    const resultData = {
      jobId: job.id,
      solverName: response.solver.name,
      solverVersion: response.solver.version,
      results: { metrics: response.metrics, contributions: response.contributions } as object,
      trace: response.trace as object,
      numericMetadata: response.numericMetadata as object,
      warnings: response.warnings as object,
      errorBounds: response.errorBounds as object,
      computeTimeMs: Math.round(response.computeTimeMs),
      executedOn: 'SERVER_NATIVE' as const,
      createdById: job.requestedById,
    };

    await prisma.analysisResult.upsert({
      where: {
        diagramId_contentHash_method: {
          diagramId: job.diagramId,
          contentHash: job.contentHash,
          method: job.method,
        },
      },
      create: {
        diagramId: job.diagramId,
        contentHash: job.contentHash,
        method: job.method,
        options: job.options as object,
        ...resultData,
      },
      update: resultData,
    });

    await prisma.analysisJob.update({
      where: { id: payload.jobId },
      data: { status: 'COMPLETED', finishedAt: new Date(), progress: 1 },
    });
    logger.info(
      { jobId: job.id, method: job.method, computeTimeMs: resultData.computeTimeMs },
      'analysis job completed',
    );
    await notifications.create({
      userId: job.requestedById,
      type: 'ANALYSIS_COMPLETE',
      payload: { jobId: job.id, diagramId: job.diagramId, method: job.method },
    });
  } catch (err) {
    // A thrown error here is an unexpected/deterministic failure — record it as
    // FAILED and notify once (no re-throw, so pg-boss doesn't pointlessly retry
    // a deterministic failure and spam the user). Worker crashes/hangs are still
    // retried: such jobs never reach this catch, so they expire (expireInSeconds)
    // and pg-boss reclaims + retries them up to retryLimit.
    const errorMessage = err instanceof Error ? err.message : String(err);
    await prisma.analysisJob.update({
      where: { id: payload.jobId },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage,
        errorStack: err instanceof Error ? (err.stack ?? null) : null,
      },
    });
    logger.error({ jobId: payload.jobId, err }, 'analysis job threw');
    await notifications.create({
      userId: job.requestedById,
      type: 'ANALYSIS_FAILED',
      payload: { jobId: job.id, diagramId: job.diagramId, method: job.method, error: errorMessage },
    });
  }
}
