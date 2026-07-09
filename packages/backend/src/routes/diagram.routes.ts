import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { requireProjectRole } from '../middleware/requireProjectRole.js';
import {
  CreateDiagramInputSchema,
  DiagramService,
  UpdateDiagramInputSchema,
} from '../services/diagram.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { CreateSnapshotInputSchema, SnapshotService } from '../services/snapshot.service.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const diagramRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const diagramService = new DiagramService(fastify.prisma);
  const auditLogService = new AuditLogService(fastify.prisma);
  const snapshotService = new SnapshotService(fastify.prisma);

  /**
   * GET /api/projects/:projectId/diagrams
   * List all diagrams in a project.
   */
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/diagrams',
    { preHandler: [authenticate, requireProjectRole('viewer')] },
    async (request, _reply) => {
      const { projectId } = request.params;
      const diagrams = await diagramService.findByProject(projectId);
      return { data: diagrams };
    },
  );

  /**
   * GET /api/projects/:projectId/diagrams/:diagramId
   * Get a single diagram by ID.
   */
  fastify.get<{ Params: { projectId: string; diagramId: string } }>(
    '/api/projects/:projectId/diagrams/:diagramId',
    { preHandler: [authenticate, requireProjectRole('viewer')] },
    async (request, _reply) => {
      const { diagramId } = request.params;
      const diagram = await diagramService.findById(diagramId);

      if (!diagram) {
        throw new NotFoundError(`Diagram with id '${diagramId}' not found`);
      }

      return { data: diagram };
    },
  );

  /**
   * POST /api/projects/:projectId/diagrams
   * Create a new diagram in a project.
   */
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/diagrams',
    { preHandler: [authenticate, requireProjectRole('editor')] },
    async (request, reply) => {
      const { projectId } = request.params;

      const parseResult = CreateDiagramInputSchema.safeParse({
        ...(request.body as object),
        projectId,
      });

      if (!parseResult.success) {
        throw new ValidationError(
          'Invalid diagram data',
          parseResult.error.flatten(),
        );
      }

      const userId = request.user!.id;
      const diagram = await diagramService.create(parseResult.data, userId);

      await auditLogService.log({
        userId,
        action: 'DIAGRAM_CREATED',
        objectType: 'diagram',
        objectId: diagram.id,
        metadata: { projectId, type: diagram.type, name: diagram.name },
      });

      reply.status(201);
      return { data: diagram };
    },
  );

  /**
   * PATCH /api/projects/:projectId/diagrams/:diagramId
   * Update an existing diagram.
   */
  fastify.patch<{ Params: { projectId: string; diagramId: string } }>(
    '/api/projects/:projectId/diagrams/:diagramId',
    { preHandler: [authenticate, requireProjectRole('editor')] },
    async (request, _reply) => {
      const { diagramId } = request.params;

      const parseResult = UpdateDiagramInputSchema.safeParse(request.body);

      if (!parseResult.success) {
        throw new ValidationError(
          'Invalid update data',
          parseResult.error.flatten(),
        );
      }

      // Verify diagram exists
      const existing = await diagramService.findById(diagramId);
      if (!existing) {
        throw new NotFoundError(`Diagram with id '${diagramId}' not found`);
      }

      const diagram = await diagramService.update(diagramId, parseResult.data);

      await auditLogService.log({
        userId: request.user!.id,
        action: 'DIAGRAM_UPDATED',
        objectType: 'diagram',
        objectId: diagram.id,
        metadata: { name: diagram.name },
      });

      return { data: diagram };
    },
  );

  /**
   * DELETE /api/projects/:projectId/diagrams/:diagramId
   * Delete a diagram.
   */
  fastify.delete<{ Params: { projectId: string; diagramId: string } }>(
    '/api/projects/:projectId/diagrams/:diagramId',
    { preHandler: [authenticate, requireProjectRole('editor')] },
    async (request, reply) => {
      const { diagramId } = request.params;

      // Verify diagram exists
      const existing = await diagramService.findById(diagramId);
      if (!existing) {
        throw new NotFoundError(`Diagram with id '${diagramId}' not found`);
      }

      await diagramService.delete(diagramId);

      await auditLogService.log({
        userId: request.user!.id,
        action: 'DIAGRAM_DELETED',
        objectType: 'diagram',
        objectId: diagramId,
      });

      reply.status(204);
      return;
    },
  );

  /**
   * GET /api/projects/:projectId/diagrams/:diagramId/state
   * Get the Yjs collaborative editing state for a diagram (binary).
   */
  fastify.get<{ Params: { projectId: string; diagramId: string } }>(
    '/api/projects/:projectId/diagrams/:diagramId/state',
    { preHandler: [authenticate, requireProjectRole('viewer')] },
    async (request, reply) => {
      const { diagramId } = request.params;

      const state = await diagramService.getState(diagramId);

      if (!state) {
        throw new NotFoundError(
          `No state found for diagram '${diagramId}'`,
        );
      }

      reply.header('Content-Type', 'application/octet-stream');
      return reply.send(state);
    },
  );

  /**
   * PUT /api/projects/:projectId/diagrams/:diagramId/state
   * Save the Yjs collaborative editing state for a diagram (binary).
   */
  fastify.put<{ Params: { projectId: string; diagramId: string } }>(
    '/api/projects/:projectId/diagrams/:diagramId/state',
    { preHandler: [authenticate, requireProjectRole('editor')] },
    async (request, reply) => {
      const { diagramId } = request.params;

      // Verify diagram exists
      const existing = await diagramService.findById(diagramId);
      if (!existing) {
        throw new NotFoundError(`Diagram with id '${diagramId}' not found`);
      }

      // The body should be raw binary data
      const body = request.body;
      let buffer: Buffer;

      if (Buffer.isBuffer(body)) {
        buffer = body;
      } else if (body instanceof Uint8Array) {
        buffer = Buffer.from(body);
      } else if (typeof body === 'string') {
        buffer = Buffer.from(body, 'base64');
      } else {
        throw new ValidationError(
          'Request body must be binary data (application/octet-stream)',
        );
      }

      await diagramService.saveState(diagramId, buffer);

      await auditLogService.log({
        userId: request.user!.id,
        action: 'DIAGRAM_STATE_SAVED',
        objectType: 'diagram',
        objectId: diagramId,
      });

      reply.status(204);
      return;
    },
  );

  /**
   * GET /api/projects/:projectId/diagrams/:diagramId/snapshots
   * List snapshots for a diagram.
   */
  fastify.get<{ Params: { projectId: string; diagramId: string } }>(
    '/api/projects/:projectId/diagrams/:diagramId/snapshots',
    { preHandler: [authenticate, requireProjectRole('viewer')] },
    async (request) => {
      const snapshots = await snapshotService.listByDiagram(request.params.diagramId);
      return { data: snapshots };
    },
  );

  /**
   * POST /api/projects/:projectId/diagrams/:diagramId/snapshots
   * Create a snapshot using the current Yjs state.
   */
  fastify.post<{ Params: { projectId: string; diagramId: string } }>(
    '/api/projects/:projectId/diagrams/:diagramId/snapshots',
    { preHandler: [authenticate, requireProjectRole('editor')] },
    async (request, reply) => {
      const parseResult = CreateSnapshotInputSchema.safeParse(request.body ?? {});
      if (!parseResult.success) {
        throw new ValidationError('Invalid snapshot data', parseResult.error.flatten());
      }

      const snapshot = await snapshotService.createFromDiagram(
        request.params.diagramId,
        request.user!.id,
        parseResult.data.label,
      ).catch((err) => {
        throw new ValidationError(err?.message ?? 'Failed to create snapshot');
      });

      await auditLogService.log({
        userId: request.user!.id,
        action: 'DIAGRAM_SNAPSHOT_CREATED',
        objectType: 'diagram',
        objectId: request.params.diagramId,
        metadata: { snapshotId: snapshot.id, label: snapshot.label },
      });

      reply.status(201);
      return { data: snapshot };
    },
  );
};

export default diagramRoutes;
