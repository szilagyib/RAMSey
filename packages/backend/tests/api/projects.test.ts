import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestApp,
  createMockProject,
  authHeaders,
  type MockPrismaClient,
} from '../helpers/setup.js';

describe('Project Routes', () => {
  let app: FastifyInstance;
  let prisma: MockPrismaClient;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    prisma = result.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.project.findMany.mockReset();
    prisma.project.findUnique.mockReset();
    prisma.project.create.mockReset();
    prisma.project.update.mockReset();
    prisma.project.delete.mockReset();
  });

  describe('GET /api/projects', () => {
    it('returns project list', async () => {
      const projects = [createMockProject(), createMockProject()];
      prisma.project.findMany.mockResolvedValueOnce(projects);

      const response = await app.inject({
        method: 'GET',
        url: '/api/projects',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
    });
  });

  describe('POST /api/projects', () => {
    it('creates a project with valid data', async () => {
      const newProject = createMockProject({ name: 'My RAMS Project' });
      prisma.project.create.mockResolvedValueOnce(newProject);

      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: {
          name: 'My RAMS Project',
          ownerType: 'user',
          ownerId: newProject.ownerId,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.name).toBe('My RAMS Project');
    });

    it('returns 400 for invalid body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: {
          // missing required 'name' field
          ownerType: 'user',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('returns a project by id', async () => {
      const project = createMockProject();
      // findUnique is hit twice: once by requireProjectRole's access check,
      // once by the route handler — so use a persistent mock, not Once.
      prisma.project.findUnique.mockResolvedValue(project);

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.id).toBe(project.id);
    });

    it('returns 403 for a project the user cannot access', async () => {
      // A nonexistent (or inaccessible) project is denied by requireProjectRole
      // before the handler runs, so the access layer responds 403, not 404.
      prisma.project.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/00000000-0000-0000-0000-000000000099',
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
