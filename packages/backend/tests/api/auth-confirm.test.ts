import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { createTestApp, type MockPrismaClient } from '../helpers/setup.js';
import { COOKIE_NAME } from '../../src/utils/jwt.js';
import { hashConfirmationCode } from '../../src/services/verification-token.service.js';
import { limits } from '../../src/config/limits.js';

// Sign-up confirmation flow: register issues a 6-digit code and NO session;
// /confirm exchanges the code for a session; login bounces unverified accounts.
describe('sign-up confirmation flow', () => {
  let app: FastifyInstance;
  let prisma: MockPrismaClient;
  let passwordHash: string;
  const PASSWORD = 'e2e-password-123';
  const USER_ID = '00000000-0000-4000-8000-0000000000cc';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.user.findUnique.mockReset().mockResolvedValue(null);
    prisma.user.create.mockReset().mockResolvedValue({
      id: USER_ID,
      email: 'new@example.com',
      name: 'New User',
    });
    prisma.user.update.mockReset().mockResolvedValue({ id: USER_ID });
    prisma.verificationToken.findFirst.mockReset().mockResolvedValue(null);
    prisma.verificationToken.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prisma.verificationToken.create.mockReset().mockResolvedValue({});
    prisma.verificationToken.update.mockReset().mockResolvedValue({});
  });

  const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload });

  const hasSessionCookie = (res: Awaited<ReturnType<typeof post>>) =>
    res.cookies.some((c) => c.name === COOKIE_NAME);

  // ── register ──────────────────────────────────────────────────────────────

  it('register returns pendingVerification and sets NO session cookie', async () => {
    const res = await post('/api/auth/register', {
      email: 'new@example.com',
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ pendingVerification: true, email: 'new@example.com' });
    expect(hasSessionCookie(res)).toBe(false);
    expect(prisma.verificationToken.create).toHaveBeenCalled();
  });

  it('register rejects an already-verified email with 409', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'taken@example.com',
      emailVerified: new Date(),
      passwordHash,
    });
    const res = await post('/api/auth/register', {
      email: 'taken@example.com',
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(409);
  });

  it('register on an unverified email keeps credentials without bypassing resend limits', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'pending@example.com',
      emailVerified: null,
      passwordHash,
    });
    const res = await post('/api/auth/register', {
      email: 'pending@example.com',
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.pendingVerification).toBe(true);
    expect(prisma.verificationToken.create).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('resend re-issues a code for a pending account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'pending@example.com',
      emailVerified: null,
    });

    const res = await post('/api/auth/resend-code', { email: 'pending@example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { ok: true } });
    expect(prisma.verificationToken.create).toHaveBeenCalled();
  });

  it('resend gives the same response for an unknown account without issuing a code', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await post('/api/auth/resend-code', { email: 'ghost@example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { ok: true } });
    expect(prisma.verificationToken.create).not.toHaveBeenCalled();
  });

  it('exposes the last code through the non-production E2E seam', async () => {
    await post('/api/auth/register', { email: 'new@example.com', password: PASSWORD });

    const res = await app.inject({
      method: 'GET',
      url: '/api/testing/last-code?email=new%40example.com',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.code).toMatch(/^\d{6}$/);
  });

  // ── confirm ───────────────────────────────────────────────────────────────

  const activeCode = (code: string, over: Record<string, unknown> = {}) => ({
    id: 't1',
    userId: USER_ID,
    type: 'CONFIRM_CODE',
    tokenHash: hashConfirmationCode(code, 't1'),
    usedAt: null,
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    ...over,
  });

  it('confirm with the right code verifies the account and opens a session', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'new@example.com',
      name: 'New User',
      passwordHash,
      emailVerified: null,
      tokenVersion: 0,
    });
    prisma.verificationToken.findFirst.mockResolvedValue(activeCode('123456'));

    const res = await post('/api/auth/confirm', { email: 'new@example.com', code: '123456' });

    expect(res.statusCode).toBe(200);
    expect(hasSessionCookie(res)).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emailVerified: expect.any(Date) }),
      }),
    );
  });

  it('confirm with a wrong code returns 400 and no session', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'new@example.com',
      passwordHash,
      emailVerified: null,
      tokenVersion: 0,
    });
    prisma.verificationToken.findFirst.mockResolvedValue(activeCode('123456'));

    const res = await post('/api/auth/confirm', { email: 'new@example.com', code: '000000' });

    expect(res.statusCode).toBe(400);
    expect(hasSessionCookie(res)).toBe(false);
  });

  it('confirm on a locked code returns 429', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'new@example.com',
      passwordHash,
      emailVerified: null,
      tokenVersion: 0,
    });
    prisma.verificationToken.findFirst.mockResolvedValue(
      activeCode('123456', { attempts: limits.confirmCodeMaxAttempts }),
    );

    const res = await post('/api/auth/confirm', { email: 'new@example.com', code: '123456' });
    expect(res.statusCode).toBe(429);
  });

  it('confirm for an unknown email returns 400', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await post('/api/auth/confirm', { email: 'ghost@example.com', code: '123456' });
    expect(res.statusCode).toBe(400);
  });

  // ── login bounce ──────────────────────────────────────────────────────────

  it('login on an unverified account is blocked (403, pendingVerification) with no session', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'unverified@example.com',
      name: 'U',
      passwordHash,
      emailVerified: null,
      tokenVersion: 0,
    });
    const res = await post('/api/auth/login', {
      email: 'unverified@example.com',
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      pendingVerification: true,
      email: 'unverified@example.com',
    });
    expect(hasSessionCookie(res)).toBe(false);
    expect(prisma.verificationToken.create).not.toHaveBeenCalled();
  });

  it('login on a verified account still succeeds and opens a session', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'verified@example.com',
      name: 'V',
      passwordHash,
      emailVerified: new Date(),
      tokenVersion: 0,
    });
    const res = await post('/api/auth/login', {
      email: 'verified@example.com',
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(200);
    expect(hasSessionCookie(res)).toBe(true);
  });
});
