import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, type MockPrismaClient } from '../helpers/setup.js';

describe('Health Routes', () => {
  let app: FastifyInstance;
  let prisma: MockPrismaClient;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    prisma = result.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('returns 200 with status ok', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
      expect(body.version).toBeDefined();
    });

    it('sets security headers (helmet)', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health' });
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
    });
  });

  describe('GET /api/health/ready', () => {
    it('returns 200 when database is connected', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ result: 1 }]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/health/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('ready');
    });

    it('returns 503 when database is not connected', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('Connection refused'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/health/ready',
      });

      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body.status).toBe('not ready');
      expect(body).not.toHaveProperty('error');
    });
  });

  describe('GET /api/capabilities', () => {
    it('reports optional features as booleans (both off in the test env)', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/capabilities' });

      expect(response.statusCode).toBe(200);
      // Test env has no AI provider key and no analysis queue.
      expect(response.json()).toEqual({
        aiChat: false,
        aiProviderLabel: null,
        serverAnalysis: false,
        googleOAuth: false,
      });
    });
  });
});
