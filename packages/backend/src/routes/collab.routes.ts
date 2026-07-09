import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import * as Y from 'yjs';
import { DiagramService } from '../services/diagram.service.js';
import { ProjectAccessService } from '../services/project-access.service.js';
import { COOKIE_NAME, verifyToken } from '../utils/jwt.js';
import { handleConnection, setCollabPersistence, type WSConn } from '../collab/yjsServer.js';
import { docToContent } from '../collab/projection.js';

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

const collabRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const diagramService = new DiagramService(fastify.prisma);
  const accessService = new ProjectAccessService(fastify.prisma);

  // The Yjs doc is the single source of truth: persist its binary state and the
  // derived `content` JSON together, so the two never diverge.
  setCollabPersistence({
    load: (docName) => diagramService.getState(docName),
    save: (docName, doc) =>
      diagramService.persistCollab(docName, Y.encodeStateAsUpdate(doc), docToContent(doc)),
  });

  fastify.get<{ Params: { diagramId: string } }>(
    '/yjs/:diagramId',
    { websocket: true },
    async (socket, request) => {
      const conn = socket as unknown as WSConn;

      // Authenticate the upgrade request via the JWT session cookie. Mirrors
      // the authenticate() middleware, including the revocation check
      // (deletedAt / tokenVersion), so a revoked session can't open a socket.
      const token =
        request.cookies?.[COOKIE_NAME] ?? parseCookie(request.headers.cookie, COOKIE_NAME);
      let userId: string | undefined;
      let tokenVersion = 0;
      if (token) {
        try {
          const payload = verifyToken(token);
          userId = payload.userId;
          tokenVersion = payload.tokenVersion ?? 0;
        } catch {
          userId = undefined;
        }
      }
      if (!userId) {
        conn.close(1008, 'Authentication required');
        return;
      }
      const sessionUser = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { deletedAt: true, tokenVersion: true },
      });
      if (!sessionUser || sessionUser.deletedAt || sessionUser.tokenVersion !== tokenVersion) {
        conn.close(1008, 'Authentication required');
        return;
      }

      const { diagramId } = request.params;
      const diagram = await diagramService.findById(diagramId);
      if (!diagram) {
        conn.close(1008, 'Diagram not found');
        return;
      }

      // Live editing requires editor access; viewers read the last-saved state via REST.
      const role = await accessService.getAccess(diagram.projectId, userId);
      if (!role || !accessService.hasAccess(role, 'editor')) {
        conn.close(1008, 'Editor access required for live collaboration');
        return;
      }

      await handleConnection(conn, diagramId);
    },
  );
};

export default collabRoutes;
