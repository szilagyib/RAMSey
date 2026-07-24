import { describe, it, expect } from 'vitest';
import {
  resolveProjectRole,
  type ProjectInfo,
  type ShareInfo,
  type TeamMemberInfo,
} from '../../../src/utils/permissions.js';

describe('resolveProjectRole', () => {
  const creatorId = '00000000-0000-4000-8000-000000000001';
  const otherUserId = '00000000-0000-4000-8000-000000000002';
  const teamId = '00000000-0000-4000-8000-000000000099';

  const userProject: ProjectInfo = {
    createdById: creatorId,
    ownerType: 'user',
    ownerId: creatorId,
  };

  const teamProject: ProjectInfo = {
    createdById: creatorId,
    ownerType: 'team',
    ownerId: teamId,
  };

  describe('project creator', () => {
    it('should return "owner" for the project creator', () => {
      const result = resolveProjectRole(creatorId, userProject, [], []);
      expect(result).toBe('owner');
    });

    it('should return "owner" for the creator even when team-owned', () => {
      const result = resolveProjectRole(creatorId, teamProject, [], []);
      expect(result).toBe('owner');
    });

    it('should return "owner" for the creator even when shares exist', () => {
      const shares: ShareInfo[] = [{ userId: creatorId, role: 'VIEWER' }];
      const result = resolveProjectRole(creatorId, userProject, shares, []);
      // Creator always gets owner, regardless of share
      expect(result).toBe('owner');
    });
  });

  describe('direct share', () => {
    it('should return "editor" for a user with EDITOR share', () => {
      const shares: ShareInfo[] = [{ userId: otherUserId, role: 'EDITOR' }];

      const result = resolveProjectRole(otherUserId, userProject, shares, []);
      expect(result).toBe('editor');
    });

    it('should return "viewer" for a user with VIEWER share', () => {
      const shares: ShareInfo[] = [{ userId: otherUserId, role: 'VIEWER' }];

      const result = resolveProjectRole(otherUserId, userProject, shares, []);
      expect(result).toBe('viewer');
    });

    it('should prioritize direct share over team membership', () => {
      const shares: ShareInfo[] = [{ userId: otherUserId, role: 'VIEWER' }];
      const teamMembers: TeamMemberInfo[] = [{ userId: otherUserId, role: 'admin' }];

      // Direct share (VIEWER) takes precedence over team admin (editor)
      const result = resolveProjectRole(otherUserId, teamProject, shares, teamMembers);
      expect(result).toBe('viewer');
    });
  });

  describe('team membership', () => {
    it('should return "editor" for a team admin (not owner per policy)', () => {
      const teamMembers: TeamMemberInfo[] = [{ userId: otherUserId, role: 'admin' }];

      const result = resolveProjectRole(otherUserId, teamProject, [], teamMembers);
      expect(result).toBe('editor');
    });

    it('should return "editor" for a regular team member', () => {
      const teamMembers: TeamMemberInfo[] = [{ userId: otherUserId, role: 'member' }];

      const result = resolveProjectRole(otherUserId, teamProject, [], teamMembers);
      expect(result).toBe('editor');
    });

    it('should not grant team access on user-owned projects', () => {
      const teamMembers: TeamMemberInfo[] = [{ userId: otherUserId, role: 'admin' }];

      // userProject has ownerType 'user', so team membership is irrelevant
      const result = resolveProjectRole(otherUserId, userProject, [], teamMembers);
      expect(result).toBeNull();
    });
  });

  describe('no relationship', () => {
    it('should return null for an unrelated user', () => {
      const unrelatedUser = '00000000-0000-4000-8000-000000000050';

      const result = resolveProjectRole(unrelatedUser, userProject, [], []);
      expect(result).toBeNull();
    });

    it('should return null for an unrelated user on a team project', () => {
      const unrelatedUser = '00000000-0000-4000-8000-000000000050';

      const result = resolveProjectRole(unrelatedUser, teamProject, [], []);
      expect(result).toBeNull();
    });

    it('should return null when shares exist but not for this user', () => {
      const unrelatedUser = '00000000-0000-4000-8000-000000000050';
      const shares: ShareInfo[] = [{ userId: otherUserId, role: 'EDITOR' }];

      const result = resolveProjectRole(unrelatedUser, userProject, shares, []);
      expect(result).toBeNull();
    });
  });
});
