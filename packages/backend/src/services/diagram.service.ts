import type { Diagram, PrismaClient } from '@prisma/client';
import { z } from 'zod';

// ──────────────────────────────────────────────────
// Input schemas
// ──────────────────────────────────────────────────

export const CreateDiagramInputSchema = z.object({
  projectId: z.string().uuid('projectId must be a valid UUID'),
  name: z.string().min(1, 'Name is required').max(255),
  type: z.enum([
    'RELIABILITY_BLOCK',
    'FAULT_TREE',
    'EVENT_TREE',
    'MARKOV_CHAIN',
    'BOW_TIE',
    'FMEA',
    'CUSTOM',
  ]),
});

export type CreateDiagramInput = z.infer<typeof CreateDiagramInputSchema>;

export const UpdateDiagramInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z
    .enum([
      'RELIABILITY_BLOCK',
      'FAULT_TREE',
      'EVENT_TREE',
      'MARKOV_CHAIN',
      'BOW_TIE',
      'FMEA',
      'CUSTOM',
    ])
    .optional(),
  content: z.any().optional(),
});

export type UpdateDiagramInput = z.infer<typeof UpdateDiagramInputSchema>;

// ──────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────

export class DiagramService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Find all diagrams belonging to a project.
   */
  async findByProject(projectId: string): Promise<Diagram[]> {
    const diagrams = await this.prisma.diagram.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            comments: true,
            snapshots: true,
          },
        },
      },
    });

    return diagrams;
  }

  /**
   * Find a single diagram by its ID.
   */
  async findById(id: string): Promise<Diagram | null> {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            ownerType: true,
          },
        },
        _count: {
          select: {
            comments: true,
            snapshots: true,
            analysisJobs: true,
          },
        },
      },
    });

    return diagram;
  }

  /**
   * Create a new diagram.
   */
  async create(data: CreateDiagramInput, userId: string): Promise<Diagram> {
    const diagram = await this.prisma.diagram.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        type: data.type,
        createdById: userId,
      },
    });

    return diagram;
  }

  /**
   * Update an existing diagram.
   */
  async update(id: string, data: UpdateDiagramInput): Promise<Diagram> {
    const diagram = await this.prisma.diagram.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.content !== undefined && { content: data.content }),
      },
    });

    return diagram;
  }

  /**
   * Delete a diagram.
   */
  async delete(id: string): Promise<void> {
    await this.prisma.diagram.delete({
      where: { id },
    });
  }

  /**
   * Save the Yjs collaborative editing state for a diagram.
   */
  async saveState(id: string, yjsState: Uint8Array): Promise<void> {
    await this.prisma.diagram.update({
      where: { id },
      data: { yjsState: yjsState as Uint8Array<ArrayBuffer> },
    });
  }

  /**
   * Persist a collaborative diagram from its Yjs doc: writes the binary state
   * and the derived `content` JSON in a single update so they never diverge.
   * The Yjs doc is the single source of truth; `content` is a derived read-model.
   */
  async persistCollab(id: string, yjsState: Uint8Array, content: unknown): Promise<void> {
    await this.prisma.diagram.update({
      where: { id },
      data: {
        yjsState: yjsState as Uint8Array<ArrayBuffer>,
        content: content as object,
      },
    });
  }

  /**
   * Retrieve the Yjs collaborative editing state for a diagram.
   */
  async getState(id: string): Promise<Uint8Array | null> {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id },
      select: { yjsState: true },
    });

    if (!diagram || !diagram.yjsState) {
      return null;
    }

    return new Uint8Array(diagram.yjsState);
  }
}
