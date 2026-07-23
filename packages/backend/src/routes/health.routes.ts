import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { env } from '../config/env.js';
import { getAnalysisQueue } from '../queue/analysisQueue.js';
import { describeAiConfig } from '../services/llm/config.js';

const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * GET /api/health
   * Basic health check endpoint.
   */
  fastify.get('/api/health', async (_request, _reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '0.1.0',
    };
  });

  /**
   * GET /api/capabilities
   * Which optional features this deployment has enabled, so the UI can hide
   * (rather than break) what isn't configured. No secrets: `aiProviderLabel`
   * names where chat data is sent (for the panel's privacy notice) and is null
   * whenever AI chat is off.
   */
  fastify.get('/api/capabilities', async (_request, _reply) => {
    const ai = describeAiConfig(process.env);
    return {
      aiChat: ai.configured,
      aiProviderLabel: ai.label,
      serverAnalysis: getAnalysisQueue() !== null,
      googleOAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    };
  });

  /**
   * GET /api/health/ready
   * Readiness check — verifies that the database is connected and responsive.
   */
  fastify.get('/api/health/ready', async (_request, reply) => {
    try {
      // Attempt a simple query to verify DB connectivity
      await fastify.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'connected',
        },
      };
    } catch (error) {
      // The ALB calls this route publicly through Cloudflare. Keep connection
      // details in structured logs instead of reflecting them to the internet.
      fastify.log.error({ error }, 'database readiness check failed');
      reply.status(503);
      return {
        status: 'not ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'disconnected',
        },
      };
    }
  });
};

export default healthRoutes;
