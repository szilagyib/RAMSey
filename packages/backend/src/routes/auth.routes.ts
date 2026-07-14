import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { OAuth2Namespace, ProviderConfiguration } from '@fastify/oauth2';
import fp from 'fastify-plugin';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { COOKIE_NAME, COOKIE_OPTIONS, signToken } from '../utils/jwt.js';
import { env } from '../config/env.js';
import { VerificationTokenService } from '../services/verification-token.service.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.service.js';
import { limits } from '../config/limits.js';

// bcrypt only uses the first 72 bytes of a password, so cap there to avoid
// silent truncation (two long passwords sharing a 72-byte prefix would match).
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().optional(),
});

// Login intentionally does NOT re-enforce complexity — it authenticates
// whatever the user has — only that a password is present and within the
// bcrypt length bound.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
});

const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72),
});
const verifyEmailSchema = z.object({ token: z.string().min(1) });

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Conditionally register Google OAuth
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const oauth2 = await import('@fastify/oauth2');
    await fastify.register(oauth2.default, {
      name: 'googleOAuth2',
      scope: ['profile', 'email'],
      credentials: {
        client: {
          id: env.GOOGLE_CLIENT_ID,
          secret: env.GOOGLE_CLIENT_SECRET,
        },
        // The runtime plugin object carries the provider presets, but the
        // module's type doesn't declare them — narrow cast instead of `any`.
        auth: (oauth2.default as unknown as { GOOGLE_CONFIGURATION: ProviderConfiguration })
          .GOOGLE_CONFIGURATION,
      },
      startRedirectPath: '/api/auth/google',
      callbackUri: `${env.FRONTEND_URL}/api/auth/google/callback`,
    });

    fastify.get('/api/auth/google/callback', async (request, reply) => {
      try {
        const oauthClient = (fastify as FastifyInstance & { googleOAuth2: OAuth2Namespace })
          .googleOAuth2;
        const { token } = await oauthClient.getAccessTokenFromAuthorizationCodeFlow(request);
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${token.access_token}` },
        });
        const profile = (await profileRes.json()) as {
          id: string;
          email: string;
          name?: string;
          picture?: string;
        };

        // Upsert user
        let user = await fastify.prisma.user.findUnique({ where: { googleId: profile.id } });
        if (!user) {
          user = await fastify.prisma.user.findUnique({ where: { email: profile.email } });
          if (user) {
            user = await fastify.prisma.user.update({
              where: { id: user.id },
              data: { googleId: profile.id, emailVerified: user.emailVerified ?? new Date() },
            });
          } else {
            // OAuth provider already verified the address.
            user = await fastify.prisma.user.create({
              data: {
                email: profile.email,
                name: profile.name,
                image: profile.picture,
                googleId: profile.id,
                emailVerified: new Date(),
              },
            });
          }
        }

        const jwtToken = signToken({
          userId: user.id,
          email: user.email,
          name: user.name ?? undefined,
          tokenVersion: user.tokenVersion,
        });
        reply.setCookie(COOKIE_NAME, jwtToken, COOKIE_OPTIONS);
        return reply.redirect(env.FRONTEND_URL);
      } catch (err) {
        fastify.log.error(err);
        return reply.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
      }
    });
  }

  fastify.post(
    '/api/auth/register',
    { config: { rateLimit: limits.rateLimits.authRegister } },
    async (request, reply) => {
      const body = registerSchema.parse(request.body);
      const existing = await fastify.prisma.user.findUnique({ where: { email: body.email } });
      if (existing) {
        return reply.status(409).send({ message: 'Email already registered' });
      }
      const passwordHash = await bcrypt.hash(body.password, 12);
      const user = await fastify.prisma.user.create({
        data: { email: body.email, name: body.name, passwordHash },
      });
      // Send an email-verification link (best-effort — registration succeeds
      // regardless; verification is soft and does not block login).
      try {
        const tokens = new VerificationTokenService(fastify.prisma);
        const raw = await tokens.issue(user.id, 'EMAIL_VERIFY');
        await sendVerificationEmail(user.email, `${env.FRONTEND_URL}/verify-email?token=${raw}`);
      } catch (err) {
        fastify.log.error(err, 'failed to send verification email');
      }
      const token = signToken({
        userId: user.id,
        email: user.email,
        name: user.name ?? undefined,
        tokenVersion: user.tokenVersion,
      });
      reply.setCookie(COOKIE_NAME, token, COOKIE_OPTIONS);
      return reply.status(201).send({ data: { id: user.id, email: user.email, name: user.name } });
    },
  );

  fastify.post(
    '/api/auth/login',
    { config: { rateLimit: limits.rateLimits.authLogin } },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const user = await fastify.prisma.user.findUnique({ where: { email: body.email } });
      if (!user || !user.passwordHash) {
        return reply.status(401).send({ message: 'Invalid email or password' });
      }
      const valid = await bcrypt.compare(body.password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ message: 'Invalid email or password' });
      }
      const token = signToken({
        userId: user.id,
        email: user.email,
        name: user.name ?? undefined,
        tokenVersion: user.tokenVersion,
      });
      reply.setCookie(COOKIE_NAME, token, COOKIE_OPTIONS);
      return reply.send({ data: { id: user.id, email: user.email, name: user.name } });
    },
  );

  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ data: { ok: true } });
  });

  fastify.get('/api/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        emailVerified: true,
        createdAt: true,
      },
    });
    if (!user) return reply.status(404).send({ message: 'User not found' });
    return reply.send({ data: user });
  });

  // Request a password-reset link. Always responds 200 — never reveal whether
  // an account exists (no enumeration). Only password (non-OAuth) accounts get
  // a link.
  fastify.post(
    '/api/auth/forgot-password',
    { config: { rateLimit: limits.rateLimits.passwordReset } },
    async (request, reply) => {
      const body = forgotPasswordSchema.parse(request.body);
      const user = await fastify.prisma.user.findUnique({ where: { email: body.email } });
      if (user && user.passwordHash) {
        const tokens = new VerificationTokenService(fastify.prisma);
        const raw = await tokens.issue(user.id, 'PASSWORD_RESET');
        await sendPasswordResetEmail(user.email, `${env.FRONTEND_URL}/reset-password?token=${raw}`);
      }
      return reply.send({ data: { ok: true } });
    },
  );

  // Consume a reset token and set a new password.
  fastify.post(
    '/api/auth/reset-password',
    { config: { rateLimit: limits.rateLimits.passwordReset } },
    async (request, reply) => {
      const body = resetPasswordSchema.parse(request.body);
      const tokens = new VerificationTokenService(fastify.prisma);
      const userId = await tokens.consume(body.token, 'PASSWORD_RESET');
      if (!userId) {
        return reply.status(400).send({ message: 'Invalid or expired reset link' });
      }
      const passwordHash = await bcrypt.hash(body.password, 12);
      // Bumping tokenVersion revokes every outstanding session, not just this
      // browser's cookie — whoever triggered the reset gets exclusive access.
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      return reply.send({ data: { ok: true } });
    },
  );

  // Consume an email-verification token and mark the address verified.
  fastify.post(
    '/api/auth/verify-email',
    { config: { rateLimit: limits.rateLimits.emailVerify } },
    async (request, reply) => {
      const body = verifyEmailSchema.parse(request.body);
      const tokens = new VerificationTokenService(fastify.prisma);
      const userId = await tokens.consume(body.token, 'EMAIL_VERIFY');
      if (!userId) {
        return reply.status(400).send({ message: 'Invalid or expired verification link' });
      }
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { emailVerified: new Date() },
      });
      return reply.send({ data: { ok: true } });
    },
  );

  // Re-send a verification link to the signed-in user (if still unverified).
  fastify.post(
    '/api/auth/resend-verification',
    { preHandler: [authenticate], config: { rateLimit: limits.rateLimits.resendVerification } },
    async (request, reply) => {
      const user = await fastify.prisma.user.findUnique({ where: { id: request.user!.id } });
      if (user && !user.emailVerified) {
        const tokens = new VerificationTokenService(fastify.prisma);
        const raw = await tokens.issue(user.id, 'EMAIL_VERIFY');
        await sendVerificationEmail(user.email, `${env.FRONTEND_URL}/verify-email?token=${raw}`);
      }
      return reply.send({ data: { ok: true } });
    },
  );

  // Export the signed-in user's own data (GDPR portability) as JSON.
  fastify.get('/api/auth/export', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const [profile, projects, diagrams, teamMemberships, comments] = await Promise.all([
      fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          emailVerified: true,
          createdAt: true,
        },
      }),
      fastify.prisma.project.findMany({ where: { createdById: userId } }),
      fastify.prisma.diagram.findMany({ where: { createdById: userId } }),
      fastify.prisma.teamMember.findMany({
        where: { userId },
        include: { team: { select: { id: true, name: true, slug: true } } },
      }),
      fastify.prisma.comment.findMany({ where: { userId } }),
    ]);
    reply.header('Content-Disposition', 'attachment; filename="ramsey-data-export.json"');
    return reply.send({
      data: { profile, projects, diagrams, teamMemberships, comments },
    });
  });

  // Delete the signed-in user's account (GDPR erasure). We anonymize rather than
  // hard-delete: PII is scrubbed and personal data (tokens, chat usage,
  // notifications) is removed, but the row is retained so shared content
  // (projects/diagrams/comments) stays intact for collaborators.
  fastify.delete('/api/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    await fastify.prisma.$transaction([
      fastify.prisma.verificationToken.deleteMany({ where: { userId } }),
      fastify.prisma.chatUsage.deleteMany({ where: { userId } }),
      fastify.prisma.notification.deleteMany({ where: { userId } }),
      fastify.prisma.user.update({
        where: { id: userId },
        data: {
          // `.invalid` is reserved (RFC 2606) and the id keeps it unique.
          email: `deleted+${userId}@deleted.invalid`,
          name: null,
          image: null,
          passwordHash: null,
          googleId: null,
          deletedAt: new Date(),
          // Belt + braces with the deletedAt check: kill all live sessions now.
          tokenVersion: { increment: 1 },
        },
      }),
    ]);
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ data: { ok: true } });
  });
};

export default fp(authRoutes, { name: 'auth-routes' });
