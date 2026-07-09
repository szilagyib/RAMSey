/**
 * Single-use, hashed tokens for email verification and password reset.
 *
 * The raw token is returned once (to embed in an emailed link); only its
 * SHA-256 hash is persisted, so a database leak yields no usable tokens.
 * Tokens are single-use (marked `usedAt` on consume) and time-bounded.
 */
import crypto from 'node:crypto';
import type { PrismaClient, VerificationTokenType } from '@prisma/client';
import { limits } from '../config/limits.js';

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export class VerificationTokenService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Issue a fresh token of the given type, invalidating any prior unused tokens
   * of the same type for the user. Returns the RAW token (store only its hash).
   */
  async issue(userId: string, type: VerificationTokenType): Promise<string> {
    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + limits.verificationTokenTtlMs[type]);

    await this.prisma.verificationToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.verificationToken.create({
      data: { userId, type, tokenHash, expiresAt },
    });
    return raw;
  }

  /**
   * Validate and consume a token. Returns the owning userId, or null if the
   * token is unknown, the wrong type, already used, or expired.
   */
  async consume(raw: string, type: VerificationTokenType): Promise<string | null> {
    const tokenHash = hashToken(raw);
    const token = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });
    if (
      !token ||
      token.type !== type ||
      token.usedAt !== null ||
      token.expiresAt.getTime() < Date.now()
    ) {
      return null;
    }
    await this.prisma.verificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
    return token.userId;
  }
}
