import fastifyCookie from '@fastify/cookie';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const cookiePlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  await fastify.register(fastifyCookie);
};

export default fp(cookiePlugin, { name: 'cookie' });
