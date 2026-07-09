import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '../helpers/setup.js';

describe('Rate limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Mock prisma defaults to user.findUnique -> null, so login returns 401.
    const result = await createTestApp();
    app = result.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 once the per-route auth limit (10/min) is exceeded', async () => {
    const login = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'nobody@example.com', password: 'whatever' },
      });

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await login();
      statuses.push(res.statusCode);
    }

    // First 10 are allowed (and rejected with 401 by the handler), the 11th is throttled.
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('exempts health checks from rate limiting', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await app.inject({ method: 'GET', url: '/api/health' });
      statuses.push(res.statusCode);
    }
    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});
