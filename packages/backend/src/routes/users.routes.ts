import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { authenticate } from '../middleware/authenticate.js';

const usersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/api/users/search', { preHandler: [authenticate] }, async (request, reply) => {
    const { email } = request.query as { email?: string };
    if (!email) return reply.status(400).send({ message: 'email query param required' });
    const user = await fastify.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });
    if (!user) return reply.status(404).send({ message: 'User not found' });
    return reply.send({ data: user });
  });
};

export default fp(usersRoutes, { name: 'users-routes' });
