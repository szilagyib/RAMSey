import type { PrismaClient, Project } from '@prisma/client';
import { z } from 'zod';

// ──────────────────────────────────────────────────
// Input schemas
// ──────────────────────────────────────────────────

export const CreateProjectInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(2000).optional(),
  ownerType: z.enum(['user', 'team']).default('user'),
  ownerId: z.string().uuid('ownerId must be a valid UUID'),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

// ──────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────

export class ProjectService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Find all projects accessible by a user.
   * This includes:
   *  - Projects created by the user
   *  - Projects owned by the user
   *  - Projects shared with the user (via ProjectShare)
   */
  async findAll(userId: string): Promise<Project[]> {
    const prisma = this.prisma as unknown as {
      teamMember: {
        findMany: (args: unknown) => Promise<Array<{ teamId: string }>>;
      };
    };
    const teamMemberships = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = teamMemberships.map((m) => m.teamId);

    const projects = await this.prisma.project.findMany({
      where: {
        OR: [
          { createdById: userId },
          { ownerType: 'user', ownerId: userId },
          ...(teamIds.length > 0
            ? [{ ownerType: 'team', ownerId: { in: teamIds } }]
            : []),
          {
            shares: {
              some: {
                userId: userId,
              },
            },
          },
        ],
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return projects;
  }

  /**
   * Find a single project by its ID.
   */
  async findById(id: string): Promise<Project | null> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        shares: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            diagrams: true,
          },
        },
      },
    });

    return project;
  }

  /**
   * Create a new project.
   */
  async create(data: CreateProjectInput, userId: string): Promise<Project> {
    const project = await this.prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        ownerType: data.ownerType,
        ownerId: data.ownerId,
        createdById: userId,
      },
    });

    return project;
  }

  /**
   * Update an existing project.
   */
  async update(id: string, data: UpdateProjectInput): Promise<Project> {
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });

    return project;
  }

  /**
   * Delete a project and all associated data (cascading).
   */
  async delete(id: string): Promise<void> {
    await this.prisma.project.delete({
      where: { id },
    });
  }
}
