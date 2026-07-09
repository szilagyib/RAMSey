import type { PrismaClient, Team, TeamMember, TeamRole } from '@prisma/client';
import { z } from 'zod';

export const CreateTeamInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  slug: z.string().min(2, 'Slug is required').max(64),
});

export type CreateTeamInput = z.infer<typeof CreateTeamInputSchema>;

export const AddTeamMemberInputSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

export type AddTeamMemberInput = z.infer<typeof AddTeamMemberInputSchema>;

export class TeamService {
  constructor(private readonly prisma: PrismaClient) {}

  async listForUser(userId: string): Promise<Team[]> {
    return this.prisma.team.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(teamId: string): Promise<Team | null> {
    return this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
  }

  async create(data: CreateTeamInput, userId: string): Promise<Team> {
    return this.prisma.team.create({
      data: {
        name: data.name,
        slug: data.slug,
        createdById: userId,
        members: {
          create: {
            userId,
            role: 'ADMIN',
          },
        },
      },
    });
  }

  async delete(teamId: string): Promise<void> {
    await this.prisma.team.delete({ where: { id: teamId } });
  }

  async getUserRole(teamId: string, userId: string): Promise<TeamRole | null> {
    const member = await this.prisma.teamMember.findFirst({
      where: { teamId, userId },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  /** Number of ADMIN members in a team — used to prevent orphaning a team. */
  async getAdminCount(teamId: string): Promise<number> {
    return this.prisma.teamMember.count({
      where: { teamId, role: 'ADMIN' },
    });
  }

  /** Count of projects owned by this team. A team that owns projects can't be deleted. */
  async countOwnedProjects(teamId: string): Promise<number> {
    return this.prisma.project.count({
      where: { ownerType: 'team', ownerId: teamId },
    });
  }

  async addMember(teamId: string, data: AddTeamMemberInput): Promise<TeamMember> {
    return this.prisma.teamMember.create({
      data: {
        teamId,
        userId: data.userId,
        role: data.role,
      },
    });
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    await this.prisma.teamMember.delete({
      where: {
        teamId_userId: { teamId, userId },
      },
    });
  }
}
