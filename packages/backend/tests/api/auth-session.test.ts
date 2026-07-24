import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestApp,
  authHeaders,
  TEST_USER_ID,
  type MockPrismaClient,
} from '../helpers/setup.js';

// Session revocation: authenticate() rejects tokens for deleted users and for
// stale tokenVersions (bumped by password reset / account deletion).
// One shared app (like the other API suites) — building a Fastify app per test
// is slow enough to hit the test timeout under full-suite load.
describe('auth session revocation', () => {
  let app: FastifyInstance;
  let prisma: MockPrismaClient;

  const liveUser = {
    id: TEST_USER_ID,
    email: 'test@example.com',
    name: 'Test User',
    deletedAt: null as Date | null,
    tokenVersion: 0,
  };

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue({ ...liveUser });
  });

  const getMe = () =>
    app.inject({ method: 'GET', url: '/api/auth/me', headers: authHeaders() });

  it('accepts a live user with a matching tokenVersion', async () => {
    const res = await getMe();
    expect(res.statusCode).toBe(200);
  });

  it('rejects a token once the account is deleted', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...liveUser,
      email: `deleted+${TEST_USER_ID}@deleted.invalid`,
      name: null,
      deletedAt: new Date(),
      tokenVersion: 1,
    });
    const res = await getMe();
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token whose tokenVersion is stale (password reset)', async () => {
    // bumped; authHeaders() token carries version 0
    prisma.user.findUnique.mockResolvedValue({ ...liveUser, tokenVersion: 1 });
    const res = await getMe();
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token for a user that no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await getMe();
    expect(res.statusCode).toBe(401);
  });
});
