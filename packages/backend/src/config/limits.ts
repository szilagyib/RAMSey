import { env } from './env.js';

/**
 * SINGLE SOURCE OF TRUTH for every tunable operational limit in the backend:
 * rate limits, chat bounds, AI cost budgets, token TTLs, and worker retry.
 *
 * Rule for this codebase: if a value is "configurable", it lives here — not
 * inline in a route, service, or plugin. Values that must be tunable per
 * deployment (the AI cost budgets) are read from validated env vars (env.ts);
 * everything else is a code constant you change in one place.
 */
export const limits = {
  /** @fastify/rate-limit configs. `global` is the default; the rest are per-route. */
  rateLimits: {
    global: { max: 100, timeWindow: '1 minute' },
    authRegister: { max: 5, timeWindow: '1 minute' },
    authLogin: { max: 10, timeWindow: '1 minute' },
    passwordReset: { max: 5, timeWindow: '15 minutes' },
    emailVerify: { max: 10, timeWindow: '15 minutes' },
    resendVerification: { max: 3, timeWindow: '15 minutes' },
    chat: { max: 20, timeWindow: '1 minute' },
  },

  /** AI chat request bounds + model settings (see chat.validation, ai.service). */
  chat: {
    maxRawMessages: 100,
    maxHistoryMessages: 16,
    maxMessageChars: 4000,
    maxContextNodes: 600,
    maxContextEdges: 1200,
    maxSessionIdChars: 100,
    model: 'claude-sonnet-4-5-20250929',
    maxOutputTokens: 2048,
    maxToolRounds: 10,
    /** Hard cap on diagram-mutating tool calls in ONE chat turn (~25-node diagram ≈ 50 calls). */
    maxToolCallsPerTurn: 60,
  },

  /**
   * AI cost ceiling, measured in tokens (input + output) as a proxy for spend.
   * Three tiers, all env-tunable so operators can adjust without a redeploy:
   *   - perSession: caps a single chat session (one editing session / panel).
   *   - perUserMonthly: caps one user's spend in a calendar month (UTC).
   *   - totalMonthly: global cap across all users in a calendar month (UTC).
   * A request is allowed when ALL three tiers are under budget; the request that
   * crosses a tier finishes and is recorded, so the next one is blocked.
   */
  aiBudget: {
    perSessionTokens: env.AI_BUDGET_PER_SESSION_TOKENS,
    perUserMonthlyTokens: env.AI_BUDGET_PER_USER_MONTHLY_TOKENS,
    totalMonthlyTokens: env.AI_BUDGET_TOTAL_MONTHLY_TOKENS,
  },

  /** Verification/reset token lifetimes, keyed by VerificationTokenType. */
  verificationTokenTtlMs: {
    EMAIL_VERIFY: 24 * 60 * 60 * 1000, // 24 hours
    PASSWORD_RESET: 60 * 60 * 1000, // 1 hour
  },

  /** pg-boss analysis-job resilience (see pgBossQueue). */
  worker: {
    retryLimit: 3,
    retryDelaySeconds: 10,
    retryBackoff: true,
    expireInSeconds: 600,
  },

  /**
   * chat_usage ledger retention in calendar months (current month included).
   * The cost-ceiling queries only read the current month; older rows are
   * pruned by the worker's daily cleanup job.
   */
  chatUsageRetentionMonths: 3,
} as const;
