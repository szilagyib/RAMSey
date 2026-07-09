import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  ChatBudgetService,
  currentYearMonth,
  retentionCutoffYearMonth,
} from '../../../src/services/chat-budget.service.js';
import { limits } from '../../../src/config/limits.js';

function mockPrisma() {
  return {
    chatUsage: {
      aggregate: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaClient & {
    chatUsage: {
      aggregate: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };
}

const sum = (n: number) => ({ _sum: { totalTokens: n } });

describe('currentYearMonth', () => {
  it('formats as UTC YYYY-MM', () => {
    expect(currentYearMonth(new Date('2026-06-11T13:00:00Z'))).toBe('2026-06');
  });
});

describe('ChatBudgetService.check', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  beforeEach(() => {
    prisma = mockPrisma();
  });

  // check() sums in order: [session, user-month, total-month].
  it('allows when every tier is under budget', async () => {
    prisma.chatUsage.aggregate
      .mockResolvedValueOnce(sum(0)) // session
      .mockResolvedValueOnce(sum(0)) // user-month
      .mockResolvedValueOnce(sum(0)); // total-month
    const res = await new ChatBudgetService(prisma).check('u1', 's1');
    expect(res.allowed).toBe(true);
  });

  it('denies the session tier when the session is exhausted', async () => {
    prisma.chatUsage.aggregate
      .mockResolvedValueOnce(sum(limits.aiBudget.perSessionTokens))
      .mockResolvedValueOnce(sum(0))
      .mockResolvedValueOnce(sum(0));
    const res = await new ChatBudgetService(prisma).check('u1', 's1');
    expect(res.allowed).toBe(false);
    expect(res.tier).toBe('session');
  });

  it('denies the user-monthly tier', async () => {
    prisma.chatUsage.aggregate
      .mockResolvedValueOnce(sum(0))
      .mockResolvedValueOnce(sum(limits.aiBudget.perUserMonthlyTokens))
      .mockResolvedValueOnce(sum(0));
    const res = await new ChatBudgetService(prisma).check('u1', 's1');
    expect(res.tier).toBe('user-monthly');
  });

  it('denies (and reports) the total-monthly tier first — least recoverable', async () => {
    prisma.chatUsage.aggregate
      .mockResolvedValueOnce(sum(limits.aiBudget.perSessionTokens)) // session also over
      .mockResolvedValueOnce(sum(0))
      .mockResolvedValueOnce(sum(limits.aiBudget.totalMonthlyTokens));
    const res = await new ChatBudgetService(prisma).check('u1', 's1');
    expect(res.tier).toBe('total-monthly');
  });
});

describe('ChatBudgetService.record', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  beforeEach(() => {
    prisma = mockPrisma();
  });

  it('writes a usage row with the summed total and current month', async () => {
    await new ChatBudgetService(prisma).record('u1', 's1', {
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(prisma.chatUsage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        sessionId: 's1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        yearMonth: currentYearMonth(),
      }),
    });
  });

  it('skips a no-op (zero-token) record', async () => {
    await new ChatBudgetService(prisma).record('u1', 's1', { inputTokens: 0, outputTokens: 0 });
    expect(prisma.chatUsage.create).not.toHaveBeenCalled();
  });
});

describe('retentionCutoffYearMonth', () => {
  it('keeps the current month for retention=1', () => {
    expect(retentionCutoffYearMonth(1, new Date('2026-06-11T12:00:00Z'))).toBe('2026-06');
  });

  it('keeps N calendar months, crossing year boundaries', () => {
    expect(retentionCutoffYearMonth(3, new Date('2026-06-11T12:00:00Z'))).toBe('2026-04');
    expect(retentionCutoffYearMonth(3, new Date('2026-01-15T12:00:00Z'))).toBe('2025-11');
  });
});

describe('ChatBudgetService.prune', () => {
  it('deletes rows strictly older than the retention cutoff and returns the count', async () => {
    const prisma = mockPrisma();
    prisma.chatUsage.deleteMany.mockResolvedValue({ count: 42 });
    const now = new Date('2026-06-11T12:00:00Z');

    const removed = await new ChatBudgetService(prisma).prune(now);

    expect(removed).toBe(42);
    expect(prisma.chatUsage.deleteMany).toHaveBeenCalledWith({
      where: {
        yearMonth: { lt: retentionCutoffYearMonth(limits.chatUsageRetentionMonths, now) },
      },
    });
  });
});
