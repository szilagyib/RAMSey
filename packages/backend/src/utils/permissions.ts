/**
 * Permission resolution for RAMSey projects.
 *
 * Resolution order:
 * 1. Project creator -> owner
 * 2. Direct share -> use that role (EDITOR or VIEWER)
 * 3. Team member: admin -> editor (with team admin powers), member -> editor
 * 4. Otherwise -> null (forbidden)
 */

export interface ProjectInfo {
  createdById: string;
  ownerType: string;
  ownerId: string;
}

export interface ShareInfo {
  userId: string;
  role: 'EDITOR' | 'VIEWER';
}

export interface TeamMemberInfo {
  userId: string;
  role: 'admin' | 'member';
}

export type ResolvedRole = 'owner' | 'editor' | 'viewer' | null;

/**
 * Resolves the effective role a user has on a project.
 *
 * @param userId - The ID of the user to check
 * @param project - The project being accessed
 * @param shares - Direct project shares (ProjectShare records)
 * @param teamMembers - Team members if the project is team-owned
 * @returns The resolved role, or null if the user has no access
 */
export function resolveProjectRole(
  userId: string,
  project: ProjectInfo,
  shares: ShareInfo[],
  teamMembers: TeamMemberInfo[],
): ResolvedRole {
  // 1. Project creator is always the owner
  if (project.createdById === userId) {
    return 'owner';
  }

  // 2. Check direct shares — explicit share takes priority over team membership
  const directShare = shares.find((share) => share.userId === userId);
  if (directShare) {
    return directShare.role === 'EDITOR' ? 'editor' : 'viewer';
  }

  // 3. Check team membership (only relevant for team-owned projects)
  if (project.ownerType === 'team') {
    const teamMember = teamMembers.find((member) => member.userId === userId);
    if (teamMember) {
      // Team admins get editor role (not owner — per policy, owner is reserved for creator)
      // Team members also get editor role
      return 'editor';
    }
  }

  // 4. No relationship found — user has no access
  return null;
}
