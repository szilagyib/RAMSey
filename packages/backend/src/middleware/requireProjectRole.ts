import type { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { ProjectAccessService, type ProjectAccessRole } from '../services/project-access.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    projectAccess?: {
      projectId: string;
      role: ProjectAccessRole;
    };
  }
}

export function requireProjectRole(required: ProjectAccessRole) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const projectId = (request.params as { projectId?: string; id?: string })?.projectId
      ?? (request.params as { id?: string })?.id;

    if (!projectId) {
      throw new NotFoundError('Project id is required');
    }

    const accessService = new ProjectAccessService(request.server.prisma);
    const role = await accessService.getAccess(projectId, request.user!.id);

    if (!role || !accessService.hasAccess(role, required)) {
      throw new ForbiddenError('Insufficient permissions for this project');
    }

    request.projectAccess = { projectId, role };
  };
}
