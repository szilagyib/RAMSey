import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  VerificationTokenService,
  hashConfirmationCode,
  hashToken,
} from '../../../src/services/verification-token.service.js';
import {
  sendConfirmationCodeEmail,
  readLastConfirmCode,
} from '../../../src/services/email.service.js';
import { limits } from '../../../src/config/limits.js';

function mockPrisma() {
  return {
    verificationToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient & {
    verificationToken: {
      updateMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

describe('VerificationTokenService.issueCode', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  beforeEach(() => {
    prisma = mockPrisma();
  });

  it('returns a 6-digit numeric code but persists only its hash, with a ~10-min expiry', async () => {
    const svc = new VerificationTokenService(prisma);
    const code = await svc.issueCode('user-1');

    expect(code).toMatch(/^\d{6}$/);
    const createArg = prisma.verificationToken.create.mock.calls[0][0].data;
    expect(createArg.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(createArg.tokenHash).toBe(hashConfirmationCode(code, createArg.id));
    expect(createArg.tokenHash).not.toBe(code);
    expect(createArg.tokenHash).not.toBe(hashToken(code));
    expect(createArg.userId).toBe('user-1');
    expect(createArg.type).toBe('CONFIRM_CODE');
    const ttl = createArg.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(limits.verificationTokenTtlMs.CONFIRM_CODE - 5_000);
    expect(ttl).toBeLessThanOrEqual(limits.verificationTokenTtlMs.CONFIRM_CODE);
  });

  it('invalidates prior unused confirmation codes first', async () => {
    const svc = new VerificationTokenService(prisma);
    await svc.issueCode('user-1');
    expect(prisma.verificationToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', type: 'CONFIRM_CODE', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('salts identical codes per issuance so the unique hash cannot collide', () => {
    expect(hashConfirmationCode('123456', 'token-a')).not.toBe(
      hashConfirmationCode('123456', 'token-b'),
    );
  });
});

describe('VerificationTokenService.verifyCode', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  beforeEach(() => {
    prisma = mockPrisma();
  });

  it('returns "ok" and marks the code used for a matching, live code', async () => {
    prisma.verificationToken.findFirst.mockResolvedValue({
      id: 't1',
      userId: 'user-1',
      type: 'CONFIRM_CODE',
      tokenHash: hashConfirmationCode('123456', 't1'),
      usedAt: null,
      attempts: 0,
      expiresAt: future(),
    });
    const svc = new VerificationTokenService(prisma);
    expect(await svc.verifyCode('user-1', '123456')).toBe('ok');
    expect(prisma.verificationToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: 't1',
        usedAt: null,
        attempts: { lt: limits.confirmCodeMaxAttempts },
        expiresAt: { gte: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('returns "invalid" and increments attempts for a wrong code', async () => {
    prisma.verificationToken.findFirst.mockResolvedValue({
      id: 't1',
      userId: 'user-1',
      type: 'CONFIRM_CODE',
      tokenHash: hashConfirmationCode('123456', 't1'),
      usedAt: null,
      attempts: 1,
      expiresAt: future(),
    });
    const svc = new VerificationTokenService(prisma);
    expect(await svc.verifyCode('user-1', '000000')).toBe('invalid');
    expect(prisma.verificationToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: 't1',
        usedAt: null,
        attempts: { lt: limits.confirmCodeMaxAttempts },
      },
      data: { attempts: { increment: 1 } },
    });
  });

  it('allows only one concurrent submission to consume the code', async () => {
    prisma.verificationToken.findFirst.mockResolvedValue({
      id: 't1',
      userId: 'user-1',
      type: 'CONFIRM_CODE',
      tokenHash: hashConfirmationCode('123456', 't1'),
      usedAt: null,
      attempts: 0,
      expiresAt: future(),
    });
    prisma.verificationToken.updateMany.mockResolvedValue({ count: 0 });

    const svc = new VerificationTokenService(prisma);
    expect(await svc.verifyCode('user-1', '123456')).toBe('invalid');
  });

  it('returns "invalid" when the user has no active code', async () => {
    prisma.verificationToken.findFirst.mockResolvedValue(null);
    const svc = new VerificationTokenService(prisma);
    expect(await svc.verifyCode('user-1', '123456')).toBe('invalid');
    expect(prisma.verificationToken.updateMany).not.toHaveBeenCalled();
  });

  it('returns "expired" for an expired code without counting an attempt', async () => {
    prisma.verificationToken.findFirst.mockResolvedValue({
      id: 't1',
      userId: 'user-1',
      type: 'CONFIRM_CODE',
      tokenHash: hashConfirmationCode('123456', 't1'),
      usedAt: null,
      attempts: 0,
      expiresAt: past(),
    });
    const svc = new VerificationTokenService(prisma);
    expect(await svc.verifyCode('user-1', '123456')).toBe('expired');
    expect(prisma.verificationToken.updateMany).not.toHaveBeenCalled();
  });

  it('returns "locked" once the attempt ceiling is reached, even for the right code', async () => {
    prisma.verificationToken.findFirst.mockResolvedValue({
      id: 't1',
      userId: 'user-1',
      type: 'CONFIRM_CODE',
      tokenHash: hashConfirmationCode('123456', 't1'),
      usedAt: null,
      attempts: limits.confirmCodeMaxAttempts,
      expiresAt: future(),
    });
    const svc = new VerificationTokenService(prisma);
    expect(await svc.verifyCode('user-1', '123456')).toBe('locked');
    expect(prisma.verificationToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('sendConfirmationCodeEmail', () => {
  it('captures the code for the test seam (retrievable, case-insensitively)', async () => {
    await sendConfirmationCodeEmail('Person@Example.com', '424242');
    expect(readLastConfirmCode('person@example.com')).toBe('424242');
  });

  it('logs the code when no SMTP is configured (dev/test fallback)', async () => {
    const { logger } = await import('../../../src/config/logger.js');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never);
    await sendConfirmationCodeEmail('someone@example.com', '135790');
    expect(warn).toHaveBeenCalled();
    const msg = warn.mock.calls[0][1] as string;
    expect(msg).toContain('135790');
    warn.mockRestore();
  });
});
