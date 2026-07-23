import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '../helpers/setup.js';

describe('collab /yjs route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = (await createTestApp()).app;
  });

  afterAll(async () => {
    await app.close();
  });

  // A plain (non-upgrade) GET must hit @fastify/websocket's built-in 404 handler
  // for websocket routes — NOT fall through to the ws handler, which would run
  // with (request, reply) and crash on `conn.close is not a function`. Getting a
  // 404 proves the plugin's onRoute override reaches this route, i.e. the
  // websocket plugin is registered app-wide (fastify-plugin) rather than
  // encapsulated.
  it('returns 404 for a non-websocket GET (does not 500)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/yjs/00000000-0000-4000-8000-000000000001',
    });
    expect(res.statusCode).toBe(404);
  });
});
