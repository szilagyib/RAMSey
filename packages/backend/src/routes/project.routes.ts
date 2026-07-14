import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { requireProjectRole } from '../middleware/requireProjectRole.js';
import {
  CreateProjectInputSchema,
  ProjectService,
  UpdateProjectInputSchema,
} from '../services/project.service.js';
import { TeamService } from '../services/team.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const projectRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const projectService = new ProjectService(fastify.prisma);
  const teamService = new TeamService(fastify.prisma);
  const auditLogService = new AuditLogService(fastify.prisma);

  /**
   * GET /api/projects
   * List all projects accessible by the authenticated user.
   */
  fastify.get('/api/projects', { preHandler: [authenticate] }, async (request, _reply) => {
    const userId = request.user!.id;
    const projects = await projectService.findAll(userId);
    return { data: projects };
  });

  /**
   * GET /api/projects/:id
   * Get a single project by ID.
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/projects/:id',
    { preHandler: [authenticate, requireProjectRole('viewer')] },
    async (request, _reply) => {
      const { id } = request.params;
      const project = await projectService.findById(id);

      if (!project) {
        throw new NotFoundError(`Project with id '${id}' not found`);
      }

      return { data: project };
    },
  );

  /**
   * POST /api/projects
   * Create a new project.
   */
  fastify.post('/api/projects', { preHandler: [authenticate] }, async (request, reply) => {
    const parseResult = CreateProjectInputSchema.safeParse(request.body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid project data', parseResult.error.flatten());
    }

    const userId = request.user!.id;
    if (parseResult.data.ownerType === 'team') {
      const teamRole = await teamService.getUserRole(parseResult.data.ownerId, userId);
      if (teamRole !== 'ADMIN') {
        throw new ValidationError('Only team admins can create team-owned projects');
      }
    }
    const project = await projectService.create(parseResult.data, userId);

    await auditLogService.log({
      userId,
      action: 'PROJECT_CREATED',
      objectType: 'project',
      objectId: project.id,
      metadata: { ownerType: project.ownerType, ownerId: project.ownerId },
    });

    reply.status(201);
    return { data: project };
  });

  /**
   * PATCH /api/projects/:id
   * Update an existing project.
   */
  fastify.patch<{ Params: { id: string } }>(
    '/api/projects/:id',
    { preHandler: [authenticate, requireProjectRole('owner')] },
    async (request, _reply) => {
      const { id } = request.params;

      const parseResult = UpdateProjectInputSchema.safeParse(request.body);

      if (!parseResult.success) {
        throw new ValidationError('Invalid update data', parseResult.error.flatten());
      }

      // Verify project exists
      const existing = await projectService.findById(id);
      if (!existing) {
        throw new NotFoundError(`Project with id '${id}' not found`);
      }

      const project = await projectService.update(id, parseResult.data);

      await auditLogService.log({
        userId: request.user!.id,
        action: 'PROJECT_UPDATED',
        objectType: 'project',
        objectId: project.id,
        metadata: { name: project.name },
      });

      return { data: project };
    },
  );

  /**
   * DELETE /api/projects/:id
   * Delete a project.
   */
  fastify.delete<{ Params: { id: string } }>(
    '/api/projects/:id',
    { preHandler: [authenticate, requireProjectRole('owner')] },
    async (request, reply) => {
      const { id } = request.params;

      // Verify project exists
      const existing = await projectService.findById(id);
      if (!existing) {
        throw new NotFoundError(`Project with id '${id}' not found`);
      }

      await projectService.delete(id);

      await auditLogService.log({
        userId: request.user!.id,
        action: 'PROJECT_DELETED',
        objectType: 'project',
        objectId: id,
      });

      reply.status(204);
      return;
    },
  );
};

export default projectRoutes;
