import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'engine',
          root: './packages/engine',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'backend-unit',
          root: './packages/backend',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'backend-api',
          root: './packages/backend',
          include: ['tests/api/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'backend-integration',
          root: './packages/backend',
          include: ['tests/integration/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'frontend-unit',
          root: './packages/frontend',
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
