import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ProjectService } from '../../../src/services/project.service.js';
import {
  mockPrismaClient,
  createMockProject,
  type MockPrismaClient,
} from '../../helpers/setup.js';

describe('ProjectService', () => {
  let prisma: MockPrismaClient;
  let service: ProjectService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = mockPrismaClient();
    service = new ProjectService(prisma as unknown as PrismaClient);
  });

  describe('findAll', () => {
    it('should return projects for the given user', async () => {
      const userId = '00000000-0000-4000-8000-000000000001';
      const mockProjects = [
        createMockProject({ createdById: userId, ownerId: userId }),
        createMockProject({ createdById: userId, ownerId: userId }),
      ];

      prisma.project.findMany.mockResolvedValue(mockProjects);

      const result = await service.findAll(userId);

      expect(result).toEqual(mockProjects);
      expect(prisma.project.findMany).toHaveBeenCalledOnce();
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { createdById: userId },
            { ownerType: 'user', ownerId: userId },
            { shares: { some: { userId } } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should return empty array when user has no projects', async () => {
      const userId = '00000000-0000-4000-8000-000000000099';
      prisma.project.findMany.mockResolvedValue([]);

      const result = await service.findAll(userId);

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return a project when found', async () => {
      const project = createMockProject();
      prisma.project.findUnique.mockResolvedValue(project);

      const result = await service.findById(project.id);

      expect(result).toEqual(project);
      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: project.id },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          shares: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          _count: {
            select: { diagrams: true },
          },
        },
      });
    });

    it('should return null when project is not found', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      const result = await service.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a project with correct data', async () => {
      const userId = '00000000-0000-4000-8000-000000000001';
      const input = {
        name: 'New Project',
        description: 'A new test project',
        ownerType: 'user' as const,
        ownerId: userId,
      };

      const createdProject = createMockProject({
        name: input.name,
        description: input.description,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        createdById: userId,
      });

      prisma.project.create.mockResolvedValue(createdProject);

      const result = await service.create(input, userId);

      expect(result).toEqual(createdProject);
      expect(prisma.project.create).toHaveBeenCalledWith({
        data: {
          name: input.name,
          description: input.description,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          createdById: userId,
        },
      });
    });

    it('should create a project without optional description', async () => {
      const userId = '00000000-0000-4000-8000-000000000001';
      const input = {
        name: 'Minimal Project',
        ownerType: 'user' as const,
        ownerId: userId,
      };

      const createdProject = createMockProject({
        name: input.name,
        description: null,
        createdById: userId,
      });

      prisma.project.create.mockResolvedValue(createdProject);

      const result = await service.create(input, userId);

      expect(result.name).toBe('Minimal Project');
      expect(prisma.project.create).toHaveBeenCalledOnce();
    });
  });

  describe('update', () => {
    it('should update project fields', async () => {
      const project = createMockProject();
      const updateData = {
        name: 'Updated Project Name',
        description: 'Updated description',
      };

      const updatedProject = {
        ...project,
        ...updateData,
        updatedAt: new Date(),
      };

      prisma.project.update.mockResolvedValue(updatedProject);

      const result = await service.update(project.id, updateData);

      expect(result.name).toBe('Updated Project Name');
      expect(result.description).toBe('Updated description');
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: project.id },
        data: {
          name: 'Updated Project Name',
          description: 'Updated description',
        },
      });
    });

    it('should update only provided fields', async () => {
      const project = createMockProject();
      const updateData = { name: 'Only Name Updated' };

      prisma.project.update.mockResolvedValue({
        ...project,
        name: 'Only Name Updated',
      });

      const result = await service.update(project.id, updateData);

      expect(result.name).toBe('Only Name Updated');
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: project.id },
        data: {
          name: 'Only Name Updated',
        },
      });
    });
  });

  describe('delete', () => {
    it('should call prisma delete with the correct id', async () => {
      const projectId = '00000000-0000-4000-8000-000000000010';
      prisma.project.delete.mockResolvedValue(undefined);

      await service.delete(projectId);

      expect(prisma.project.delete).toHaveBeenCalledOnce();
      expect(prisma.project.delete).toHaveBeenCalledWith({
        where: { id: projectId },
      });
    });
  });
});
