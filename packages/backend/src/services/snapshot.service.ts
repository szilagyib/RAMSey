import type { DiagramSnapshot, PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const CreateSnapshotInputSchema = z.object({
  label: z.string().max(255).optional(),
});

export type CreateSnapshotInput = z.infer<typeof CreateSnapshotInputSchema>;

export class SnapshotService {
  constructor(private readonly prisma: PrismaClient) {}

  async listByDiagram(diagramId: string): Promise<DiagramSnapshot[]> {
    return this.prisma.diagramSnapshot.findMany({
      where: { diagramId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async createFromDiagram(diagramId: string, createdById: string, label?: string): Promise<DiagramSnapshot> {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id: diagramId },
      select: { yjsState: true },
    });

    if (!diagram?.yjsState) {
      throw new Error('No Yjs state found for diagram');
    }

    return this.prisma.diagramSnapshot.create({
      data: {
        diagramId,
        createdById,
        label,
        yjsState: diagram.yjsState,
      },
    });
  }
}
