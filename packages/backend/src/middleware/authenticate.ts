import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../utils/errors.js';
import { COOKIE_NAME, verifyToken } from '../utils/jwt.js';

/**
 * User information attached to the request after authentication.
 */
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/**
 * Fastify preHandler hook that validates JWT from cookie.
 *
 * Beyond signature/expiry, this checks the user row (one PK lookup) so that
 * sessions are actually revocable: a deleted account or a bumped tokenVersion
 * (password reset, "log out everywhere") invalidates every outstanding JWT
 * immediately instead of after the 7-day expiry.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = request.cookies?.[COOKIE_NAME];
  if (!token) throw new UnauthorizedError('Authentication required');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired session');
  }

  const user = await request.server.prisma.user.findUnique({
    where: { id: payload.userId },
    select: { deletedAt: true, tokenVersion: true },
  });
  if (!user || user.deletedAt || user.tokenVersion !== (payload.tokenVersion ?? 0)) {
    throw new UnauthorizedError('Invalid or expired session');
  }

  request.user = { id: payload.userId, email: payload.email, name: payload.name };
}
