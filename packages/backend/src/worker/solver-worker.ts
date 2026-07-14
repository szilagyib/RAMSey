import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { initSentry, captureException } from '../config/sentry.js';
import { startPgBoss, stopPgBoss } from '../queue/pgBossQueue.js';
import { ANALYSIS_QUEUE, type AnalysisJobPayload } from '../queue/analysisQueue.js';
import { processAnalysisJob } from './processAnalysisJob.js';
import { ChatBudgetService } from '../services/chat-budget.service.js';

// Separate process: consumes analysis jobs from the queue and runs the engine.
async function main(): Promise<void> {
  initSentry();
  const prisma = new PrismaClient();
  await prisma.$connect();
  const boss = await startPgBoss(env.DATABASE_URL);

  await boss.work<AnalysisJobPayload>(ANALYSIS_QUEUE, async (jobs) => {
    for (const job of jobs) {
      try {
        await processAnalysisJob(job.data, prisma);
      } catch (err) {
        // processAnalysisJob records FAILED + notifies for expected failures;
        // reaching here means a hard failure (e.g. DB unavailable). Log it and
        // rethrow so pg-boss applies its retry policy instead of silently
        // dropping the job.
        logger.error(
          { err, queueJobId: job.id },
          'analysis worker handler error; pg-boss will retry',
        );
        captureException(err);
        throw err;
      }
    }
  });

  // Daily housekeeping: prune chat_usage rows older than the retention window
  // (03:00 UTC; pg-boss dedupes the schedule across worker replicas).
  const CHAT_USAGE_CLEANUP = 'chat-usage-cleanup';
  await boss.createQueue(CHAT_USAGE_CLEANUP);
  await boss.schedule(CHAT_USAGE_CLEANUP, '0 3 * * *');
  await boss.work(CHAT_USAGE_CLEANUP, async () => {
    const removed = await new ChatBudgetService(prisma).prune();
    logger.info({ removed }, 'chat_usage retention cleanup ran');
  });

  logger.info('Solver worker started; listening for analysis jobs');

  const shutdown = async () => {
    logger.info('Solver worker shutting down');
    await stopPgBoss();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal(err, 'Solver worker failed to start');
  process.exit(1);
});
