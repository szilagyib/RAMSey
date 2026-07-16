import { Redis } from 'ioredis';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { initSentry } from './config/sentry.js';
import { buildApp } from './app.js';
import { setAnalysisQueue } from './queue/analysisQueue.js';
import { startPgBoss, stopPgBoss, createPgBossQueue } from './queue/pgBossQueue.js';

async function start(): Promise<void> {
  try {
    initSentry();
    logger.info({ env: env.NODE_ENV }, 'Starting RAMSey backend server...');

    // Shared store for rate limiting so per-IP limits hold across replicas.
    // Fail-fast command settings + an error handler keep a flaky Redis from
    // hanging or crashing the API (the limiter fails open on Redis errors).
    const rateLimitRedis = new Redis(env.REDIS_URL, {
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
    });
    rateLimitRedis.on('error', (err: Error) => logger.warn({ err }, 'rate-limit Redis error'));

    const trustedProxies = env.TRUST_PROXY?.split(',')
      .map((proxy) => proxy.trim())
      .filter(Boolean);

    const app = await buildApp({
      loggerInstance: logger,
      rateLimitRedis,
      ...(trustedProxies?.length ? { trustProxy: trustedProxies } : {}),
    });

    // Start the analysis queue (non-fatal: server-side analysis returns 503 if it fails).
    try {
      const boss = await startPgBoss(env.DATABASE_URL);
      setAnalysisQueue(createPgBossQueue(boss));
      logger.info('Analysis queue (pg-boss) started');
    } catch (err) {
      logger.error(err, 'Failed to start analysis queue; server-side analysis disabled');
    }

    await app.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `RAMSey backend listening on port ${env.PORT}`,
    );

    // Graceful shutdown handlers
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info({ signal }, 'Received shutdown signal');
        try {
          await app.close();
          await stopPgBoss();
          rateLimitRedis.disconnect();
          logger.info('Server closed gracefully');
          process.exit(0);
        } catch (err) {
          logger.error(err, 'Error during shutdown');
          process.exit(1);
        }
      });
    }
  } catch (error) {
    logger.fatal(error, 'Failed to start server');
    process.exit(1);
  }
}

start();
