import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  createTestApp,
  createMockUser,
  authHeaders,
  type MockPrismaClient,
} from '../helpers/setup.js';

const TEAM_ID = '00000000-0000-4000-8000-0000000000b1';
const ADMIN = createMockUser({ id: '00000000-0000-4000-8000-0000000000a1' });
const MEMBER = createMockUser({ id: '00000000-0000-4000-8000-0000000000a2' });
const OUTSIDER = createMockUser({ id: '00000000-0000-4000-8000-0000000000a3' });

const json = { 'content-type': 'application/json' };

describe('Team Routes', () => {
  let app: FastifyInstance;
  let prisma: MockPrismaClient;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    prisma = result.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.team.findUnique.mockReset();
    prisma.team.create.mockReset();
    prisma.team.delete.mockReset().mockResolvedValue(undefined);
    prisma.teamMember.findFirst.mockReset();
    prisma.teamMember.findMany.mockReset();
    prisma.teamMember.count.mockReset().mockResolvedValue(0);
    prisma.teamMember.create.mockReset();
    prisma.teamMember.delete.mockReset().mockResolvedValue(undefined);
    prisma.project.count.mockReset().mockResolvedValue(0);
    prisma.notification.create.mockReset().mockResolvedValue({});
    prisma.auditLog.create.mockReset().mockResolvedValue({});
  });

  /** Resolve getUserRole() lookups from a userId -> role map. */
  function setRoles(map: Record<string, 'ADMIN' | 'MEMBER'>) {
    prisma.teamMember.findFirst.mockImplementation(async (args: { where: { userId: string } }) => {
      const role = map[args.where.userId];
      return role ? { role } : null;
    });
  }

  describe('GET /api/teams', () => {
    it("returns each team with *this user's* role in it", async () => {
      // The dashboard can't offer a team as a project owner without knowing
      // whether the caller is one of its admins — only admins may own there.
      prisma.teamMember.findMany.mockResolvedValue([
        { role: 'ADMIN', team: { id: 't1', name: 'Reliability', slug: 'reliability' } },
        { role: 'MEMBER', team: { id: 't2', name: 'Safety', slug: 'safety' } },
      ]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/teams',
        headers: authHeaders(MEMBER),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([
        { id: 't1', name: 'Reliability', slug: 'reliability', role: 'ADMIN' },
        { id: 't2', name: 'Safety', slug: 'safety', role: 'MEMBER' },
      ]);
    });
  });

  describe('GET /api/teams/:teamId', () => {
    it('returns 403 for a non-member', async () => {
      setRoles({}); // caller has no membership
      const res = await app.inject({
        method: 'GET',
        url: `/api/teams/${TEAM_ID}`,
        headers: authHeaders(OUTSIDER),
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns the team for a member', async () => {
      setRoles({ [MEMBER.id]: 'MEMBER' });
      prisma.team.findUnique.mockResolvedValueOnce({
        id: TEAM_ID,
        name: 'Reliability',
        slug: 'reliability',
        members: [{ id: 'm1', role: 'MEMBER', user: MEMBER }],
      });
      const res = await app.inject({
        method: 'GET',
        url: `/api/teams/${TEAM_ID}`,
        headers: authHeaders(MEMBER),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.id).toBe(TEAM_ID);
    });
  });

  describe('POST /api/teams', () => {
    it('creates a team', async () => {
      prisma.team.create.mockResolvedValueOnce({
        id: TEAM_ID,
        name: 'Reliability',
        slug: 'reliability',
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/teams',
        headers: { ...authHeaders(ADMIN), ...json },
        payload: { name: 'Reliability', slug: 'reliability' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.slug).toBe('reliability');
    });

    it('returns 409 for a duplicate slug', async () => {
      prisma.team.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/teams',
        headers: { ...authHeaders(ADMIN), ...json },
        payload: { name: 'Reliability', slug: 'reliability' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('returns 400 for invalid body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/teams',
        headers: { ...authHeaders(ADMIN), ...json },
        payload: { slug: 'no-name' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/teams/:teamId/members', () => {
    it('lets an admin add a new member', async () => {
      setRoles({ [ADMIN.id]: 'ADMIN' });
      prisma.teamMember.create.mockResolvedValueOnce({
        id: 'm2',
        teamId: TEAM_ID,
        userId: MEMBER.id,
        role: 'MEMBER',
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/teams/${TEAM_ID}/members`,
        headers: { ...authHeaders(ADMIN), ...json },
        payload: { userId: MEMBER.id, role: 'MEMBER' },
      });
      expect(res.statusCode).toBe(201);
      expect(prisma.notification.create).toHaveBeenCalledOnce();
    });

    it('forbids a non-admin from adding members', async () => {
      setRoles({ [MEMBER.id]: 'MEMBER' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/teams/${TEAM_ID}/members`,
        headers: { ...authHeaders(MEMBER), ...json },
        payload: { userId: OUTSIDER.id, role: 'MEMBER' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects adding a user who is already a member', async () => {
      setRoles({ [ADMIN.id]: 'ADMIN', [MEMBER.id]: 'MEMBER' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/teams/${TEAM_ID}/members`,
        headers: { ...authHeaders(ADMIN), ...json },
        payload: { userId: MEMBER.id, role: 'MEMBER' },
      });
      expect(res.statusCode).toBe(409);
      expect(prisma.teamMember.create).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/teams/:teamId/members/:userId', () => {
    it('lets an admin remove a member', async () => {
      setRoles({ [ADMIN.id]: 'ADMIN', [MEMBER.id]: 'MEMBER' });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/teams/${TEAM_ID}/members/${MEMBER.id}`,
        headers: authHeaders(ADMIN),
      });
      expect(res.statusCode).toBe(204);
      expect(prisma.teamMember.delete).toHaveBeenCalledOnce();
    });

    it('lets a member leave (remove self)', async () => {
      setRoles({ [MEMBER.id]: 'MEMBER' });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/teams/${TEAM_ID}/members/${MEMBER.id}`,
        headers: authHeaders(MEMBER),
      });
      expect(res.statusCode).toBe(204);
    });

    it('forbids a non-admin from removing someone else', async () => {
      setRoles({ [MEMBER.id]: 'MEMBER' });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/teams/${TEAM_ID}/members/${OUTSIDER.id}`,
        headers: authHeaders(MEMBER),
      });
      expect(res.statusCode).toBe(403);
      expect(prisma.teamMember.delete).not.toHaveBeenCalled();
    });

    it('refuses to remove the last admin', async () => {
      setRoles({ [ADMIN.id]: 'ADMIN' });
      prisma.teamMember.count.mockResolvedValueOnce(1);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/teams/${TEAM_ID}/members/${ADMIN.id}`,
        headers: authHeaders(ADMIN),
      });
      expect(res.statusCode).toBe(409);
      expect(prisma.teamMember.delete).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/teams/:teamId', () => {
    it('lets an admin delete an empty team', async () => {
      setRoles({ [ADMIN.id]: 'ADMIN' });
      prisma.project.count.mockResolvedValueOnce(0);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/teams/${TEAM_ID}`,
        headers: authHeaders(ADMIN),
      });
      expect(res.statusCode).toBe(204);
      expect(prisma.team.delete).toHaveBeenCalledOnce();
    });

    it('refuses to delete a team that owns projects', async () => {
      setRoles({ [ADMIN.id]: 'ADMIN' });
      prisma.project.count.mockResolvedValueOnce(2);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/teams/${TEAM_ID}`,
        headers: authHeaders(ADMIN),
      });
      expect(res.statusCode).toBe(409);
      expect(prisma.team.delete).not.toHaveBeenCalled();
    });

    it('forbids a non-admin from deleting a team', async () => {
      setRoles({ [MEMBER.id]: 'MEMBER' });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/teams/${TEAM_ID}`,
        headers: authHeaders(MEMBER),
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
