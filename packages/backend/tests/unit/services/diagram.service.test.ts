import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { DiagramService } from '../../../src/services/diagram.service.js';
import { mockPrismaClient, createMockDiagram, type MockPrismaClient } from '../../helpers/setup.js';

describe('DiagramService', () => {
  let prisma: MockPrismaClient;
  let service: DiagramService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = mockPrismaClient();
    service = new DiagramService(prisma as unknown as PrismaClient);
  });

  describe('findByProject', () => {
    it('should return diagrams for a given project', async () => {
      const projectId = '00000000-0000-4000-8000-000000000001';
      const mockDiagrams = [createMockDiagram({ projectId }), createMockDiagram({ projectId })];

      prisma.diagram.findMany.mockResolvedValue(mockDiagrams);

      const result = await service.findByProject(projectId);

      expect(result).toEqual(mockDiagrams);
      expect(result).toHaveLength(2);
      expect(prisma.diagram.findMany).toHaveBeenCalledOnce();
      expect(prisma.diagram.findMany).toHaveBeenCalledWith({
        where: { projectId },
        orderBy: { updatedAt: 'desc' },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { comments: true, snapshots: true },
          },
        },
      });
    });

    it('should return empty array when project has no diagrams', async () => {
      prisma.diagram.findMany.mockResolvedValue([]);

      const result = await service.findByProject('no-diagrams-project-id');

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return a diagram when found', async () => {
      const diagram = createMockDiagram();
      prisma.diagram.findUnique.mockResolvedValue(diagram);

      const result = await service.findById(diagram.id);

      expect(result).toEqual(diagram);
      expect(prisma.diagram.findUnique).toHaveBeenCalledWith({
        where: { id: diagram.id },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          project: {
            select: { id: true, name: true, ownerId: true, ownerType: true },
          },
          _count: {
            select: { comments: true, snapshots: true, analysisJobs: true },
          },
        },
      });
    });

    it('should return null when diagram is not found', async () => {
      prisma.diagram.findUnique.mockResolvedValue(null);

      const result = await service.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a diagram with correct data', async () => {
      const userId = '00000000-0000-4000-8000-000000000001';
      const projectId = '00000000-0000-4000-8000-000000000002';

      const input = {
        projectId,
        name: 'Test Diagram',
        type: 'RELIABILITY_BLOCK' as const,
      };

      const createdDiagram = createMockDiagram({
        projectId,
        name: input.name,
        type: input.type,
        createdById: userId,
      });

      prisma.diagram.create.mockResolvedValue(createdDiagram);

      const result = await service.create(input, userId);

      expect(result).toEqual(createdDiagram);
      expect(prisma.diagram.create).toHaveBeenCalledWith({
        data: {
          projectId: input.projectId,
          name: input.name,
          type: input.type,
          createdById: userId,
        },
      });
    });

    it('should create a fault tree diagram', async () => {
      const userId = '00000000-0000-4000-8000-000000000001';
      const input = {
        projectId: '00000000-0000-4000-8000-000000000002',
        name: 'Fault Tree Analysis',
        type: 'FAULT_TREE' as const,
      };

      const createdDiagram = createMockDiagram({
        name: input.name,
        type: input.type,
      });

      prisma.diagram.create.mockResolvedValue(createdDiagram);

      const result = await service.create(input, userId);

      expect(result.type).toBe('FAULT_TREE');
    });
  });

  describe('update', () => {
    it('should update diagram fields', async () => {
      const diagram = createMockDiagram();
      const updateData = {
        name: 'Updated Diagram',
        type: 'FAULT_TREE' as const,
      };

      prisma.diagram.update.mockResolvedValue({
        ...diagram,
        ...updateData,
      });

      const result = await service.update(diagram.id, updateData);

      expect(result.name).toBe('Updated Diagram');
      expect(result.type).toBe('FAULT_TREE');
      expect(prisma.diagram.update).toHaveBeenCalledWith({
        where: { id: diagram.id },
        data: {
          name: 'Updated Diagram',
          type: 'FAULT_TREE',
        },
      });
    });
  });

  describe('delete', () => {
    it('should call prisma delete', async () => {
      const diagramId = '00000000-0000-4000-8000-000000000010';
      prisma.diagram.delete.mockResolvedValue(undefined);

      await service.delete(diagramId);

      expect(prisma.diagram.delete).toHaveBeenCalledWith({
        where: { id: diagramId },
      });
    });
  });

  describe('saveState', () => {
    it('should update the yjs state for a diagram', async () => {
      const diagramId = '00000000-0000-4000-8000-000000000010';
      const state = Buffer.from('test-yjs-state-data');

      prisma.diagram.update.mockResolvedValue({
        ...createMockDiagram({ id: diagramId }),
        yjsState: state,
      });

      await service.saveState(diagramId, state);

      expect(prisma.diagram.update).toHaveBeenCalledWith({
        where: { id: diagramId },
        data: { yjsState: state },
      });
    });
  });

  describe('getState', () => {
    it('should return the yjs state buffer when it exists', async () => {
      const diagramId = '00000000-0000-4000-8000-000000000010';
      const stateData = Buffer.from('stored-yjs-state');

      prisma.diagram.findUnique.mockResolvedValue({
        yjsState: stateData,
      });

      const result = await service.getState(diagramId);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(result!).toString()).toBe('stored-yjs-state');
      expect(prisma.diagram.findUnique).toHaveBeenCalledWith({
        where: { id: diagramId },
        select: { yjsState: true },
      });
    });

    it('should return null when diagram has no state', async () => {
      prisma.diagram.findUnique.mockResolvedValue({
        yjsState: null,
      });

      const result = await service.getState('some-id');

      expect(result).toBeNull();
    });

    it('should return null when diagram does not exist', async () => {
      prisma.diagram.findUnique.mockResolvedValue(null);

      const result = await service.getState('nonexistent-id');

      expect(result).toBeNull();
    });
  });
});
