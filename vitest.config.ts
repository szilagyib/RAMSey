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
          // The LaTeX tests shell out to pdflatex and take seconds; they are
          // their own project (npm run test:latex) so the unit suite stays fast
          // and needs no toolchain.
          exclude: ['tests/latex/**'],
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'latex',
          root: './packages/frontend',
          include: ['tests/latex/**/*.test.ts'],
          // Compiles the exported documents, so it wants a real filesystem and
          // child processes rather than jsdom. Skips itself without pdflatex.
          environment: 'node',
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
