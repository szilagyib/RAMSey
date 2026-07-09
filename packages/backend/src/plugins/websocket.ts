import websocket from '@fastify/websocket';
import type { FastifyPluginAsync } from 'fastify';

const websocketPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(websocket);
};

export default websocketPlugin;
