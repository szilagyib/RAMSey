import type { Prisma, PrismaClient } from '@prisma/client';

export class AuditLogService {
  constructor(private readonly prisma: PrismaClient) {}

  async log(params: {
    userId?: string;
    action: string;
    objectType: string;
    objectId?: string;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string;
    sessionId?: string;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        objectType: params.objectType,
        objectId: params.objectId ?? null,
        metadata: params.metadata ?? undefined,
        ipAddress: params.ipAddress,
        sessionId: params.sessionId,
      },
    });
  }
}
