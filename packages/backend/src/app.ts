import Fastify from 'fastify';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import type { Redis } from 'ioredis';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { loggerOptions } from './config/logger.js';
import { limits } from './config/limits.js';
import cookiePlugin from './plugins/cookie.js';
import corsPlugin from './plugins/cors.js';
import prismaPlugin from './plugins/prisma.js';
import websocketPlugin from './plugins/websocket.js';
import analysisRoutes from './routes/analysis.routes.js';
import authRoutes from './routes/auth.routes.js';
import chatRoutes from './routes/chat.routes.js';
import collabRoutes from './routes/collab.routes.js';
import diagramRoutes from './routes/diagram.routes.js';
import healthRoutes from './routes/health.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import projectRoutes from './routes/project.routes.js';
import shareRoutes from './routes/share.routes.js';
import teamRoutes from './routes/team.routes.js';
import usersRoutes from './routes/users.routes.js';
import { globalErrorHandler } from './utils/errors.js';

export interface BuildAppOptions extends FastifyServerOptions {
  /**
   * If true, skip Prisma plugin registration (useful for testing with mocks).
   */
  skipPrisma?: boolean;
  /**
   * Optional Prisma client override (for testing with mocks).
   * When provided, skipPrisma is automatically set to true.
   */
  prismaOverride?: unknown;
  /**
   * Optional ioredis client backing the rate limiter. When provided, rate-limit
   * counters are shared across backend instances; when omitted (e.g. in tests),
   * the limiter falls back to per-process in-memory counters.
   */
  rateLimitRedis?: Redis;
}

/**
 * Fastify application factory.
 *
 * Creates and configures the Fastify instance with all plugins and routes.
 * The factory pattern makes it easy to create instances for testing.
 */
export async function buildApp(
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const { skipPrisma, prismaOverride, rateLimitRedis, loggerInstance, ...fastifyOpts } = opts;

  const app = Fastify({
    ...(loggerInstance
      ? { loggerInstance }
      : { logger: fastifyOpts.logger ?? loggerOptions }),
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    ...fastifyOpts,
  });

  // Global error handler
  app.setErrorHandler(globalErrorHandler);

  // Register plugins
  // Global rate limit (per-IP, in-memory). Stricter per-route limits are set
  // on auth routes via their `config.rateLimit`. Health checks are exempt.
  await app.register(rateLimit, {
    ...limits.rateLimits.global,
    // Shared counters across instances when a Redis client is supplied. Fail
    // OPEN if Redis is unreachable: availability over strictness — without
    // this, every rate-limited request 500s when Redis is down (skipOnError
    // is NOT the plugin default; the E2E suite caught exactly that).
    ...(rateLimitRedis ? { redis: rateLimitRedis, skipOnError: true } : {}),
    allowList: (req) => req.url.startsWith('/api/health'),
  });
  // Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, etc.).
  // This is a JSON/WebSocket API consumed by a separate-origin SPA, so CSP is
  // left to the frontend (nginx) layer, and CORP is cross-origin so the SPA
  // can read API responses.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(cookiePlugin);
  await app.register(corsPlugin);
  await app.register(websocketPlugin);

  if (prismaOverride) {
    app.decorate('prisma', prismaOverride as typeof app.prisma);
  } else if (!skipPrisma) {
    await app.register(prismaPlugin);
  }

  // Register routes
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(projectRoutes);
  await app.register(diagramRoutes);
  await app.register(teamRoutes);
  await app.register(shareRoutes);
  await app.register(collabRoutes);
  await app.register(chatRoutes);
  await app.register(analysisRoutes);
  await app.register(notificationRoutes);

  return app;
}
