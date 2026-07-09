import type { FastifyInstance } from 'fastify';
import { vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { COOKIE_NAME, signToken } from '../../src/utils/jwt.js';

/**
 * Fixed user id used by the default `authHeaders()` cookie. `createMockProject`
 * defaults its owner to this id, so the default authenticated user owns default
 * mock projects and passes `requireProjectRole` checks.
 */
export const TEST_USER_ID = '00000000-0000-4000-8000-0000000000aa';

// ──────────────────────────────────────────────────
// Mock Prisma Client
// ──────────────────────────────────────────────────

export interface MockPrismaClient {
  $connect: ReturnType<typeof vi.fn>;
  $disconnect: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
  project: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  diagram: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  user: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  projectShare: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  team: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  teamMember: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
  };
  notification: {
    create: ReturnType<typeof vi.fn>;
  };
  analysisJob: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  analysisResult: {
    upsert: ReturnType<typeof vi.fn>;
  };
}

/**
 * Creates a fully mocked Prisma client for unit testing.
 */
export function mockPrismaClient(): MockPrismaClient {
  return {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
    project: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(0),
    },
    diagram: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      // authenticate() now does a per-request session check (deletedAt /
      // tokenVersion), so the default must be a live user matching the
      // authHeaders() token. Tests needing "no such user" override per-test;
      // it has no passwordHash, so password login still fails by default.
      findUnique: vi.fn().mockResolvedValue({
        id: TEST_USER_ID,
        email: 'test@example.com',
        name: 'Test User',
        deletedAt: null,
        tokenVersion: 0,
      }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    projectShare: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    team: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    teamMember: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    notification: {
      create: vi.fn().mockResolvedValue({}),
    },
    analysisJob: {
      create: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    analysisResult: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

// ──────────────────────────────────────────────────
// Test App Builder
// ──────────────────────────────────────────────────

/**
 * Creates a Fastify app for testing with a mocked Prisma client.
 * The Prisma plugin is skipped and instead the mock is decorated directly.
 */
export async function createTestApp(
  prisma?: MockPrismaClient,
): Promise<{ app: FastifyInstance; prisma: MockPrismaClient }> {
  const mockPrisma = prisma ?? mockPrismaClient();

  const app = await buildApp({
    logger: false,
    prismaOverride: mockPrisma,
  });

  return { app, prisma: mockPrisma };
}

// ──────────────────────────────────────────────────
// Factory Functions
// ──────────────────────────────────────────────────

let counter = 0;
function nextId(): string {
  counter++;
  const hex = counter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

export interface MockUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const id = overrides.id ?? nextId();
  return {
    id,
    email: `user-${id.slice(-4)}@example.com`,
    name: `Test User ${id.slice(-4)}`,
    image: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

export interface MockProject {
  id: string;
  name: string;
  description: string | null;
  ownerType: string;
  ownerId: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createMockProject(
  overrides: Partial<MockProject> = {},
): MockProject {
  const id = overrides.id ?? nextId();
  const userId = overrides.createdById ?? TEST_USER_ID;
  return {
    id,
    name: `Test Project ${id.slice(-4)}`,
    description: 'A test project',
    ownerType: 'user',
    ownerId: userId,
    createdById: userId,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

export interface MockDiagram {
  id: string;
  projectId: string;
  name: string;
  type: string;
  yjsState: Buffer | null;
  thumbnail: Buffer | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createMockDiagram(
  overrides: Partial<MockDiagram> = {},
): MockDiagram {
  const id = overrides.id ?? nextId();
  return {
    id,
    projectId: overrides.projectId ?? nextId(),
    name: `Test Diagram ${id.slice(-4)}`,
    type: 'RELIABILITY_BLOCK',
    yjsState: null,
    thumbnail: null,
    createdById: overrides.createdById ?? nextId(),
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Auth header helper for test requests: returns a Cookie header carrying a
 * signed JWT, matching how `authenticate` reads the session. Defaults to
 * TEST_USER_ID, which owns projects created by `createMockProject`.
 */
export function authHeaders(user?: MockUser) {
  const token = signToken({
    userId: user?.id ?? TEST_USER_ID,
    email: user?.email ?? 'test@example.com',
    name: user?.name ?? 'Test User',
  });
  return { cookie: `${COOKIE_NAME}=${token}` };
}
