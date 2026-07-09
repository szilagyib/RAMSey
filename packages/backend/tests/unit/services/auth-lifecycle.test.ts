import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  VerificationTokenService,
  hashToken,
} from '../../../src/services/verification-token.service.js';

function mockPrisma() {
  return {
    verificationToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient & {
    verificationToken: {
      updateMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}

describe('hashToken', () => {
  it('is deterministic and never returns the raw token', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe('abc');
    expect(hashToken('abc')).toHaveLength(64); // sha256 hex
  });
});

describe('VerificationTokenService.issue', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  beforeEach(() => {
    prisma = mockPrisma();
  });

  it('returns a raw token but persists only its hash, with a future expiry', async () => {
    const svc = new VerificationTokenService(prisma);
    const raw = await svc.issue('user-1', 'PASSWORD_RESET');

    expect(raw).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes as hex
    const createArg = prisma.verificationToken.create.mock.calls[0][0].data;
    expect(createArg.tokenHash).toBe(hashToken(raw));
    expect(createArg.tokenHash).not.toBe(raw);
    expect(createArg.userId).toBe('user-1');
    expect(createArg.type).toBe('PASSWORD_RESET');
    expect(createArg.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('invalidates prior unused tokens of the same type first', async () => {
    const svc = new VerificationTokenService(prisma);
    await svc.issue('user-1', 'EMAIL_VERIFY');
    expect(prisma.verificationToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', type: 'EMAIL_VERIFY', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });
});

describe('VerificationTokenService.consume', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  beforeEach(() => {
    prisma = mockPrisma();
  });

  const future = () => new Date(Date.now() + 60_000);
  const past = () => new Date(Date.now() - 60_000);

  it('returns the userId and marks the token used for a valid token', async () => {
    prisma.verificationToken.findUnique.mockResolvedValue({
      id: 't1', userId: 'user-1', type: 'PASSWORD_RESET', usedAt: null, expiresAt: future(),
    });
    const svc = new VerificationTokenService(prisma);
    const userId = await svc.consume('raw', 'PASSWORD_RESET');
    expect(userId).toBe('user-1');
    expect(prisma.verificationToken.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('rejects an unknown token', async () => {
    prisma.verificationToken.findUnique.mockResolvedValue(null);
    const svc = new VerificationTokenService(prisma);
    expect(await svc.consume('raw', 'PASSWORD_RESET')).toBeNull();
  });

  it('rejects a token of the wrong type', async () => {
    prisma.verificationToken.findUnique.mockResolvedValue({
      id: 't1', userId: 'u', type: 'EMAIL_VERIFY', usedAt: null, expiresAt: future(),
    });
    const svc = new VerificationTokenService(prisma);
    expect(await svc.consume('raw', 'PASSWORD_RESET')).toBeNull();
    expect(prisma.verificationToken.update).not.toHaveBeenCalled();
  });

  it('rejects an already-used token', async () => {
    prisma.verificationToken.findUnique.mockResolvedValue({
      id: 't1', userId: 'u', type: 'PASSWORD_RESET', usedAt: new Date(), expiresAt: future(),
    });
    const svc = new VerificationTokenService(prisma);
    expect(await svc.consume('raw', 'PASSWORD_RESET')).toBeNull();
  });

  it('rejects an expired token', async () => {
    prisma.verificationToken.findUnique.mockResolvedValue({
      id: 't1', userId: 'u', type: 'PASSWORD_RESET', usedAt: null, expiresAt: past(),
    });
    const svc = new VerificationTokenService(prisma);
    expect(await svc.consume('raw', 'PASSWORD_RESET')).toBeNull();
  });
});

describe('email.service log fallback', () => {
  it('logs the link when no SMTP is configured (test env)', async () => {
    const { logger } = await import('../../../src/config/logger.js');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never);
    const { sendVerificationEmail } = await import('../../../src/services/email.service.js');
    await sendVerificationEmail('user@example.com', 'https://app/verify-email?token=xyz');
    expect(warn).toHaveBeenCalled();
    const msg = warn.mock.calls[0][1] as string;
    expect(msg).toContain('https://app/verify-email?token=xyz');
    warn.mockRestore();
  });
});
