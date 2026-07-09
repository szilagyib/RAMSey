import type { PrismaClient, ProjectShareRole } from '@prisma/client';

export type ProjectAccessRole = 'owner' | 'editor' | 'viewer';

const roleRank: Record<ProjectAccessRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

function mapShareRole(role: ProjectShareRole): ProjectAccessRole {
  return role === 'EDITOR' ? 'editor' : 'viewer';
}

function mapTeamRole(role: TeamRole): ProjectAccessRole {
  return role === 'ADMIN' ? 'owner' : 'editor';
}

export class ProjectAccessService {
  constructor(private readonly prisma: PrismaClient) {}

  async getAccess(projectId: string, userId: string): Promise<ProjectAccessRole | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        ownerType: true,
        ownerId: true,
      },
    });

    if (!project) return null;

    let bestRole: ProjectAccessRole | null = null;

    if (project.ownerType === 'user' && project.ownerId === userId) {
      bestRole = 'owner';
    }

    if (project.ownerType === 'team') {
      const prisma = this.prisma as unknown as {
        teamMember: {
          findFirst: (args: unknown) => Promise<{ role: TeamRole } | null>;
        };
      };
      const member = await prisma.teamMember.findFirst({
        where: {
          teamId: project.ownerId,
          userId,
        },
        select: { role: true },
      });
      if (member) {
        const teamRole = mapTeamRole(member.role);
        bestRole = !bestRole || roleRank[teamRole] > roleRank[bestRole] ? teamRole : bestRole;
      }
    }

    const share = await this.prisma.projectShare.findFirst({
      where: {
        projectId,
        userId,
      },
      select: { role: true },
    });

    if (share) {
      const shareRole = mapShareRole(share.role);
      bestRole = !bestRole || roleRank[shareRole] > roleRank[bestRole] ? shareRole : bestRole;
    }

    return bestRole;
  }

  hasAccess(access: ProjectAccessRole | null, required: ProjectAccessRole): boolean {
    if (!access) return false;
    return roleRank[access] >= roleRank[required];
  }
}
type TeamRole = 'ADMIN' | 'MEMBER';
