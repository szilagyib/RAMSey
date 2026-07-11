import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';

// ---------------------------------------------------------------------------
// Notifications: the worker/services write them (ANALYSIS_COMPLETE/FAILED,
// PROJECT_SHARED, …); these routes let the UI read and acknowledge them.
// ---------------------------------------------------------------------------

const notificationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /** GET /api/notifications — newest first, plus the unread count. */
  fastify.get('/api/notifications', { preHandler: [authenticate] }, async (request) => {
    const userId = request.user!.id;
    const [items, unread] = await Promise.all([
      fastify.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      fastify.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { data: { items, unread } };
  });

  /** POST /api/notifications/read-all — acknowledge everything. */
  fastify.post('/api/notifications/read-all', { preHandler: [authenticate] }, async (request) => {
    await fastify.prisma.notification.updateMany({
      where: { userId: request.user!.id, read: false },
      data: { read: true },
    });
    return { data: { ok: true } };
  });
};

export default notificationRoutes;
