import type { PrismaClient } from '@prisma/client';

export interface CreateAnalysisJobInput {
  diagramId: string;
  requestedById: string;
  contentHash: string;
  method: string;
  options: unknown;
}

export class AnalysisJobService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Create a QUEUED analysis job record. */
  async create(input: CreateAnalysisJobInput): Promise<{ id: string; status: string }> {
    const job = await this.prisma.analysisJob.create({
      data: {
        diagramId: input.diagramId,
        requestedById: input.requestedById,
        contentHash: input.contentHash,
        method: input.method,
        options: input.options as object,
        status: 'QUEUED',
      },
      select: { id: true, status: true },
    });
    return job;
  }

  /** Fetch a job with its result (for status polling). */
  async getById(id: string) {
    return this.prisma.analysisJob.findUnique({
      where: { id },
      include: { result: true },
    });
  }
}
