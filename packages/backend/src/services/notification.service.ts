import type { NotificationType, Prisma, PrismaClient } from '@prisma/client';

export class NotificationService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(params: {
    userId: string;
    type: NotificationType;
    payload: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        payload: params.payload,
      },
    });
  }
}
