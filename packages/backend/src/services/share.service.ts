import type { PrismaClient, ProjectShare, ShareLink } from '@prisma/client';
import { z } from 'zod';

export const CreateProjectShareInputSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  role: z.enum(['EDITOR', 'VIEWER']).default('VIEWER'),
});

export type CreateProjectShareInput = z.infer<typeof CreateProjectShareInputSchema>;

export const CreateShareLinkInputSchema = z.object({
  role: z.enum(['EDITOR', 'VIEWER']).default('VIEWER'),
  expiresAt: z.string().datetime().optional(),
});

export type CreateShareLinkInput = z.infer<typeof CreateShareLinkInputSchema>;

export class ShareService {
  constructor(private readonly prisma: PrismaClient) {}

  async listProjectShares(projectId: string): Promise<ProjectShare[]> {
    return this.prisma.projectShare.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProjectShare(projectId: string, data: CreateProjectShareInput, grantedById: string): Promise<ProjectShare> {
    return this.prisma.projectShare.upsert({
      where: {
        projectId_userId: {
          projectId,
          userId: data.userId,
        },
      },
      update: { role: data.role, grantedById },
      create: {
        projectId,
        userId: data.userId,
        role: data.role,
        grantedById,
      },
    });
  }

  async deleteProjectShare(projectId: string, shareId: string): Promise<void> {
    await this.prisma.projectShare.deleteMany({
      where: { id: shareId, projectId },
    });
  }

  async listShareLinks(projectId: string): Promise<ShareLink[]> {
    return this.prisma.shareLink.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createShareLink(projectId: string, data: CreateShareLinkInput, createdById: string): Promise<ShareLink> {
    return this.prisma.shareLink.create({
      data: {
        projectId,
        role: data.role,
        createdById,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });
  }

  async revokeShareLink(projectId: string, linkId: string): Promise<void> {
    await this.prisma.shareLink.updateMany({
      where: { id: linkId, projectId },
      data: { isActive: false },
    });
  }

  async findShareLinkByToken(token: string): Promise<ShareLink | null> {
    return this.prisma.shareLink.findUnique({
      where: { token },
      include: { project: true },
    });
  }

  async redeemShareLink(token: string, userId: string): Promise<ProjectShare | null> {
    const link = await this.prisma.shareLink.findUnique({
      where: { token },
    });

    if (!link || !link.isActive) return null;
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;

    return this.prisma.projectShare.upsert({
      where: {
        projectId_userId: {
          projectId: link.projectId,
          userId,
        },
      },
      update: { role: link.role },
      create: {
        projectId: link.projectId,
        userId,
        role: link.role,
        grantedById: link.createdById,
      },
    });
  }
}
