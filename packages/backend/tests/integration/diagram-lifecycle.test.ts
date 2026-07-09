import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestApp,
  createMockProject,
  createMockDiagram,
  authHeaders,
  createMockUser,
  type MockPrismaClient,
} from '../helpers/setup.js';

describe('Diagram Lifecycle (Integration)', () => {
  let app: FastifyInstance;
  let prisma: MockPrismaClient;
  const user = createMockUser();

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
    prisma.project.delete.mockReset();
    prisma.diagram.findMany.mockReset();
    prisma.diagram.findUnique.mockReset();
    prisma.diagram.create.mockReset();
    prisma.diagram.update.mockReset();
    prisma.diagram.delete.mockReset();
  });

  it('creates a project, adds a diagram, updates it, reads it, then deletes it', async () => {
    const headers = authHeaders(user);

    // Step 1: Create project
    const project = createMockProject({
      name: 'Integration Test Project',
      createdById: user.id,
      ownerId: user.id,
    });
    prisma.project.create.mockResolvedValueOnce(project);

    const createProjectRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: {
        name: 'Integration Test Project',
        ownerType: 'user',
        ownerId: user.id,
      },
    });
    expect(createProjectRes.statusCode).toBe(201);
    const createdProject = createProjectRes.json().data;

    // Step 2: Create diagram in project
    const diagram = createMockDiagram({
      projectId: createdProject.id,
      name: 'Pump Markov Chain',
      type: 'MARKOV_CHAIN',
      createdById: user.id,
    });
    prisma.diagram.create.mockResolvedValueOnce(diagram);
    prisma.project.findUnique.mockResolvedValue(project);

    const createDiagramRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${createdProject.id}/diagrams`,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: {
        name: 'Pump Markov Chain',
        type: 'MARKOV_CHAIN',
      },
    });
    expect(createDiagramRes.statusCode).toBe(201);
    const createdDiagram = createDiagramRes.json().data;

    // Step 3: Update diagram
    const updatedDiagram = { ...diagram, name: 'Updated Pump System' };
    prisma.diagram.findUnique.mockResolvedValueOnce(diagram);
    prisma.diagram.update.mockResolvedValueOnce(updatedDiagram);

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${createdProject.id}/diagrams/${createdDiagram.id}`,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { name: 'Updated Pump System' },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.name).toBe('Updated Pump System');

    // Step 4: Read diagram
    prisma.diagram.findUnique.mockResolvedValueOnce(updatedDiagram);

    const readRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${createdProject.id}/diagrams/${createdDiagram.id}`,
      headers,
    });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().data.name).toBe('Updated Pump System');

    // Step 5: Delete diagram
    prisma.diagram.findUnique.mockResolvedValueOnce(updatedDiagram);
    prisma.diagram.delete.mockResolvedValueOnce(updatedDiagram);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${createdProject.id}/diagrams/${createdDiagram.id}`,
      headers,
    });
    expect(deleteRes.statusCode).toBe(204);
  });
});
