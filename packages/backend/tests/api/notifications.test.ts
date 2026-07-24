import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestApp,
  authHeaders,
  TEST_USER_ID,
  type MockPrismaClient,
} from '../helpers/setup.js';

describe('notification routes', () => {
  let app: FastifyInstance;
  let prisma: MockPrismaClient;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.notification.findMany.mockReset().mockResolvedValue([]);
    prisma.notification.count.mockReset().mockResolvedValue(0);
    prisma.notification.updateMany.mockReset().mockResolvedValue({ count: 0 });
  });

  it('GET /api/notifications returns the user’s items newest-first plus unread count', async () => {
    const rows = [
      {
        id: 'n2',
        type: 'ANALYSIS_COMPLETE',
        payload: { method: 'mttf' },
        read: false,
        createdAt: '2026-07-11T10:00:00Z',
      },
      {
        id: 'n1',
        type: 'PROJECT_SHARED',
        payload: {},
        read: true,
        createdAt: '2026-07-10T10:00:00Z',
      },
    ];
    prisma.notification.findMany.mockResolvedValue(rows);
    prisma.notification.count.mockResolvedValue(1);

    const res = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ items: rows, unread: 1 });
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  });

  it('POST /api/notifications/read-all marks only the user’s unread rows', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifications/read-all',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID, read: false },
      data: { read: true },
    });
  });

  it('both routes require authentication', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/notifications' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/api/notifications/read-all' })).statusCode,
    ).toBe(401);
  });
});
