import websocket from '@fastify/websocket';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

// Must be wrapped with fastify-plugin so @fastify/websocket registers at the app
// root: its onRoute hook rewrites every `{ websocket: true }` route's handler to
// the upgrade-aware dispatcher. Without fp this plugin is encapsulated and the
// hook never reaches sibling routes (e.g. collab's /yjs), so their handler is
// invoked as a normal HTTP handler with (request, reply) and crashes.
const websocketPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  await fastify.register(websocket);
};

export default fp(websocketPlugin, { name: 'websocket' });
