import type { Prisma, PrismaClient } from '@prisma/client';
import { limits } from '../config/limits.js';

/**
 * Enforces the AI cost ceiling (config/limits.aiBudget) across three tiers,
 * measured in tokens via the chat_usage ledger.
 *
 * check() compares ACCUMULATED past usage against each tier; the request that
 * crosses a tier is allowed to finish and is recorded by record(), so the next
 * request is the one that gets blocked. Tiers are checked broadest-first so the
 * least-recoverable limit is the one reported.
 */
export type BudgetTier = 'session' | 'user-monthly' | 'total-monthly';

export interface BudgetDecision {
  allowed: boolean;
  tier?: BudgetTier;
  message?: string;
}

const MESSAGES: Record<BudgetTier, string> = {
  'total-monthly':
    'The AI assistant has reached its usage limit for this month. Please try again next month.',
  'user-monthly':
    'You have reached your monthly AI usage limit. It resets at the start of next month.',
  session: 'This chat session has reached its AI usage limit. Start a new session to keep going.',
};

/** UTC "YYYY-MM" bucket for the monthly tiers. */
export function currentYearMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Oldest yearMonth to KEEP for a retention of N calendar months (current month
 * counts as 1). "YYYY-MM" strings compare lexicographically, so rows with
 * yearMonth < cutoff are prunable.
 */
export function retentionCutoffYearMonth(retentionMonths: number, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (retentionMonths - 1), 1));
  return d.toISOString().slice(0, 7);
}

export class ChatBudgetService {
  constructor(private readonly prisma: PrismaClient) {}

  private async sumTokens(where: Prisma.ChatUsageWhereInput): Promise<number> {
    const result = await this.prisma.chatUsage.aggregate({
      _sum: { totalTokens: true },
      where,
    });
    return result._sum.totalTokens ?? 0;
  }

  async check(userId: string, sessionId: string): Promise<BudgetDecision> {
    const yearMonth = currentYearMonth();
    const [sessionTokens, userMonthTokens, totalMonthTokens] = await Promise.all([
      this.sumTokens({ userId, sessionId }),
      this.sumTokens({ userId, yearMonth }),
      this.sumTokens({ yearMonth }),
    ]);

    if (totalMonthTokens >= limits.aiBudget.totalMonthlyTokens) return deny('total-monthly');
    if (userMonthTokens >= limits.aiBudget.perUserMonthlyTokens) return deny('user-monthly');
    if (sessionTokens >= limits.aiBudget.perSessionTokens) return deny('session');
    return { allowed: true };
  }

  /**
   * Delete ledger rows older than the configured retention window. The budget
   * tiers only ever read the current month, so this is pure housekeeping.
   * Returns the number of rows removed.
   */
  async prune(now: Date = new Date()): Promise<number> {
    const cutoff = retentionCutoffYearMonth(limits.chatUsageRetentionMonths, now);
    const result = await this.prisma.chatUsage.deleteMany({
      where: { yearMonth: { lt: cutoff } },
    });
    return result.count;
  }

  async record(
    userId: string,
    sessionId: string,
    usage: { inputTokens: number; outputTokens: number },
  ): Promise<void> {
    const totalTokens = usage.inputTokens + usage.outputTokens;
    if (totalTokens <= 0) return;
    await this.prisma.chatUsage.create({
      data: {
        userId,
        sessionId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens,
        yearMonth: currentYearMonth(),
      },
    });
  }
}

function deny(tier: BudgetTier): BudgetDecision {
  return { allowed: false, tier, message: MESSAGES[tier] };
}
