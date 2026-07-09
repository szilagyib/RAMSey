import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { requireProjectRole } from '../middleware/requireProjectRole.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { NotificationService } from '../services/notification.service.js';
import {
  CreateProjectShareInputSchema,
  CreateShareLinkInputSchema,
  ShareService,
} from '../services/share.service.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const shareRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const shareService = new ShareService(fastify.prisma);
  const auditLogService = new AuditLogService(fastify.prisma);
  const notificationService = new NotificationService(fastify.prisma);

  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/shares',
    { preHandler: [authenticate, requireProjectRole('owner')] },
    async (request) => {
      const shares = await shareService.listProjectShares(request.params.projectId);
      return { data: shares };
    },
  );

  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/shares',
    { preHandler: [authenticate, requireProjectRole('owner')] },
    async (request, reply) => {
      const parseResult = CreateProjectShareInputSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid share data', parseResult.error.flatten());
      }

      const share = await shareService.createProjectShare(
        request.params.projectId,
        parseResult.data,
        request.user!.id,
      );

      await auditLogService.log({
        userId: request.user!.id,
        action: 'PROJECT_SHARED',
        objectType: 'project',
        objectId: request.params.projectId,
        metadata: { userId: share.userId, role: share.role },
      });

      await notificationService.create({
        userId: share.userId,
        type: 'PROJECT_SHARED',
        payload: { projectId: share.projectId, role: share.role },
      });

      reply.status(201);
      return { data: share };
    },
  );

  fastify.delete<{ Params: { projectId: string; shareId: string } }>(
    '/api/projects/:projectId/shares/:shareId',
    { preHandler: [authenticate, requireProjectRole('owner')] },
    async (request, reply) => {
      await shareService.deleteProjectShare(request.params.projectId, request.params.shareId);

      await auditLogService.log({
        userId: request.user!.id,
        action: 'PROJECT_SHARE_REMOVED',
        objectType: 'project',
        objectId: request.params.projectId,
        metadata: { shareId: request.params.shareId },
      });

      reply.status(204);
      return;
    },
  );

  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/share-links',
    { preHandler: [authenticate, requireProjectRole('owner')] },
    async (request) => {
      const links = await shareService.listShareLinks(request.params.projectId);
      return { data: links };
    },
  );

  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/share-links',
    { preHandler: [authenticate, requireProjectRole('owner')] },
    async (request, reply) => {
      const parseResult = CreateShareLinkInputSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid share link data', parseResult.error.flatten());
      }

      const link = await shareService.createShareLink(
        request.params.projectId,
        parseResult.data,
        request.user!.id,
      );

      await auditLogService.log({
        userId: request.user!.id,
        action: 'PROJECT_SHARE_LINK_CREATED',
        objectType: 'project',
        objectId: request.params.projectId,
        metadata: { linkId: link.id, role: link.role },
      });

      reply.status(201);
      return { data: link };
    },
  );

  fastify.delete<{ Params: { projectId: string; linkId: string } }>(
    '/api/projects/:projectId/share-links/:linkId',
    { preHandler: [authenticate, requireProjectRole('owner')] },
    async (request, reply) => {
      await shareService.revokeShareLink(request.params.projectId, request.params.linkId);

      await auditLogService.log({
        userId: request.user!.id,
        action: 'PROJECT_SHARE_LINK_REVOKED',
        objectType: 'project',
        objectId: request.params.projectId,
        metadata: { linkId: request.params.linkId },
      });

      reply.status(204);
      return;
    },
  );

  fastify.post<{ Params: { token: string } }>(
    '/api/share-links/:token/redeem',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const share = await shareService.redeemShareLink(
        request.params.token,
        request.user!.id,
      );

      if (!share) {
        throw new NotFoundError('Share link is invalid or expired');
      }

      await auditLogService.log({
        userId: request.user!.id,
        action: 'PROJECT_SHARE_LINK_REDEEMED',
        objectType: 'project',
        objectId: share.projectId,
        metadata: { role: share.role },
      });

      reply.status(201);
      return { data: share };
    },
  );
};

export default shareRoutes;
