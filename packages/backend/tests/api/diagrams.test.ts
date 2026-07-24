import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestApp,
  createMockProject,
  createMockDiagram,
  authHeaders,
  type MockPrismaClient,
} from '../helpers/setup.js';

describe('Diagram Routes', () => {
  let app: FastifyInstance;
  let prisma: MockPrismaClient;
  const projectId = '00000000-0000-4000-8000-000000000001';

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    prisma = result.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.diagram.findMany.mockReset();
    prisma.diagram.findUnique.mockReset();
    prisma.diagram.create.mockReset();
    prisma.diagram.update.mockReset();
    prisma.diagram.delete.mockReset();
    // Ensure project exists for diagram routes
    prisma.project.findUnique.mockResolvedValue(createMockProject({ id: projectId }));
  });

  describe('GET /api/projects/:projectId/diagrams', () => {
    it('returns diagram list for a project', async () => {
      const diagrams = [createMockDiagram({ projectId }), createMockDiagram({ projectId })];
      prisma.diagram.findMany.mockResolvedValueOnce(diagrams);

      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/diagrams`,
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
    });
  });

  describe('POST /api/projects/:projectId/diagrams', () => {
    it('creates a diagram with valid data', async () => {
      const newDiagram = createMockDiagram({
        projectId,
        name: 'Pump System',
        type: 'MARKOV_CHAIN',
      });
      prisma.diagram.create.mockResolvedValueOnce(newDiagram);

      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/diagrams`,
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: {
          name: 'Pump System',
          type: 'MARKOV_CHAIN',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.name).toBe('Pump System');
    });
  });

  describe('PATCH /api/projects/:projectId/diagrams/:diagramId', () => {
    it('updates a diagram', async () => {
      const diagram = createMockDiagram({ projectId });
      const updated = { ...diagram, name: 'Updated Name' };
      prisma.diagram.findUnique.mockResolvedValueOnce(diagram);
      prisma.diagram.update.mockResolvedValueOnce(updated);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/projects/${projectId}/diagrams/${diagram.id}`,
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: { name: 'Updated Name' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.name).toBe('Updated Name');
    });
  });
});
