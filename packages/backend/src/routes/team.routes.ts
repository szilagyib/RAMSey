import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { NotificationService } from '../services/notification.service.js';
import {
  AddTeamMemberInputSchema,
  CreateTeamInputSchema,
  TeamService,
} from '../services/team.service.js';

const teamRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const teamService = new TeamService(fastify.prisma);
  const auditLogService = new AuditLogService(fastify.prisma);
  const notificationService = new NotificationService(fastify.prisma);

  fastify.get('/api/teams', { preHandler: [authenticate] }, async (request) => {
    const teams = await teamService.listForUser(request.user!.id);
    return { data: teams };
  });

  fastify.get<{ Params: { teamId: string } }>(
    '/api/teams/:teamId',
    { preHandler: [authenticate] },
    async (request) => {
      const { teamId } = request.params;
      // Only members may view a team and its member list (names + emails).
      const role = await teamService.getUserRole(teamId, request.user!.id);
      if (!role) {
        throw new ForbiddenError('You are not a member of this team');
      }

      const team = await teamService.get(teamId);
      if (!team) {
        throw new NotFoundError('Team not found');
      }
      return { data: team };
    },
  );

  fastify.post(
    '/api/teams',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parseResult = CreateTeamInputSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid team data', parseResult.error.flatten());
      }

      let team;
      try {
        team = await teamService.create(parseResult.data, request.user!.id);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictError(
            `A team with slug '${parseResult.data.slug}' already exists`,
          );
        }
        throw err;
      }

      await auditLogService.log({
        userId: request.user!.id,
        action: 'TEAM_CREATED',
        objectType: 'team',
        objectId: team.id,
        metadata: { name: team.name, slug: team.slug },
      });

      reply.status(201);
      return { data: team };
    },
  );

  fastify.delete<{ Params: { teamId: string } }>(
    '/api/teams/:teamId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { teamId } = request.params;
      const role = await teamService.getUserRole(teamId, request.user!.id);
      if (role !== 'ADMIN') {
        throw new ForbiddenError('Only team admins can delete a team');
      }

      const ownedProjects = await teamService.countOwnedProjects(teamId);
      if (ownedProjects > 0) {
        throw new ConflictError(
          'Cannot delete a team that owns projects; transfer or delete them first',
        );
      }

      await teamService.delete(teamId);
      await auditLogService.log({
        userId: request.user!.id,
        action: 'TEAM_DELETED',
        objectType: 'team',
        objectId: teamId,
      });

      reply.status(204);
      return;
    },
  );

  fastify.post<{ Params: { teamId: string } }>(
    '/api/teams/:teamId/members',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const parseResult = AddTeamMemberInputSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid member data', parseResult.error.flatten());
      }

      const teamId = request.params.teamId;
      const role = await teamService.getUserRole(teamId, request.user!.id);
      if (role !== 'ADMIN') {
        throw new ForbiddenError('Only team admins can add members');
      }

      // Adding an existing member would silently change their role — reject it.
      const existing = await teamService.getUserRole(teamId, parseResult.data.userId);
      if (existing) {
        throw new ConflictError('User is already a member of this team');
      }

      const member = await teamService.addMember(teamId, parseResult.data);
      await auditLogService.log({
        userId: request.user!.id,
        action: 'TEAM_MEMBER_ADDED',
        objectType: 'team',
        objectId: teamId,
        metadata: { userId: member.userId, role: member.role },
      });

      await notificationService.create({
        userId: member.userId,
        type: 'PROJECT_SHARED',
        payload: { teamId, role: member.role },
      });

      reply.status(201);
      return { data: member };
    },
  );

  fastify.delete<{ Params: { teamId: string; userId: string } }>(
    '/api/teams/:teamId/members/:userId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { teamId, userId } = request.params;
      const callerId = request.user!.id;
      const isSelf = callerId === userId;

      const callerRole = await teamService.getUserRole(teamId, callerId);
      // Admins can remove anyone; a member may remove themselves (leave).
      if (callerRole !== 'ADMIN' && !isSelf) {
        throw new ForbiddenError('Only team admins can remove members');
      }

      const targetRole = await teamService.getUserRole(teamId, userId);
      if (!targetRole) {
        throw new NotFoundError('Member not found');
      }

      // Never leave a team without an admin.
      if (targetRole === 'ADMIN') {
        const adminCount = await teamService.getAdminCount(teamId);
        if (adminCount <= 1) {
          throw new ConflictError(
            'Cannot remove the last admin; promote another member or delete the team',
          );
        }
      }

      await teamService.removeMember(teamId, userId);
      await auditLogService.log({
        userId: callerId,
        action: 'TEAM_MEMBER_REMOVED',
        objectType: 'team',
        objectId: teamId,
        metadata: { userId },
      });

      reply.status(204);
      return;
    },
  );
};

export default teamRoutes;
