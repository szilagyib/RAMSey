import { z } from 'zod';

const envSchema = z.object({
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive().int())
    .default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  JWT_SECRET: z.string().min(32),

  GOOGLE_CLIENT_ID: z.string().optional(),

  GOOGLE_CLIENT_SECRET: z.string().optional(),

  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Optional: when unset, the AI chat endpoint degrades gracefully with an
  // "AI chat not configured" error event instead of failing to boot.
  ANTHROPIC_API_KEY: z.string().optional(),

  // Optional error tracking. When unset, Sentry is a no-op.
  SENTRY_DSN: z.string().optional(),

  // AI cost ceiling (tokens). Tunable per deployment; consumed via config/limits.
  AI_BUDGET_PER_SESSION_TOKENS: z.coerce.number().int().positive().default(200_000),
  AI_BUDGET_PER_USER_MONTHLY_TOKENS: z.coerce.number().int().positive().default(2_000_000),
  AI_BUDGET_TOTAL_MONTHLY_TOKENS: z.coerce.number().int().positive().default(50_000_000),

  // SMTP (optional). When SMTP_HOST is unset, verification/reset emails are
  // logged instead of sent — fine for dev, must be configured in production.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const messages = Object.entries(formatted)
      .filter(([key]) => key !== '_errors')
      .map(([key, value]) => {
        const errors = (value as { _errors: string[] })._errors;
        return `  ${key}: ${errors.join(', ')}`;
      })
      .join('\n');

    console.error(`Environment validation failed:\n${messages}`);

    // In test mode, provide sensible defaults so tests can run
    if (process.env['NODE_ENV'] === 'test') {
      return {
        PORT: 3000,
        DATABASE_URL: 'postgresql://test:test@localhost:5432/ramsey_test',
        REDIS_URL: 'redis://localhost:6379',
        CORS_ORIGIN: 'http://localhost:5173',
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret-key-for-testing-purposes-only-32chars',
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
        FRONTEND_URL: 'http://localhost:5173',
        ANTHROPIC_API_KEY: undefined,
        SENTRY_DSN: undefined,
        AI_BUDGET_PER_SESSION_TOKENS: 200_000,
        AI_BUDGET_PER_USER_MONTHLY_TOKENS: 2_000_000,
        AI_BUDGET_TOTAL_MONTHLY_TOKENS: 50_000_000,
        SMTP_HOST: undefined,
        SMTP_PORT: 587,
        SMTP_USER: undefined,
        SMTP_PASS: undefined,
        SMTP_FROM: undefined,
      };
    }

    throw new Error('Invalid environment configuration');
  }

  return result.data;
}

export const env = loadEnv();
