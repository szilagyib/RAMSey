/**
 * Single-use credentials for sign-up confirmation and password reset.
 *
 * High-entropy links use SHA-256. Short confirmation codes use a keyed HMAC
 * plus a per-issuance ID, blocking offline brute force and hash collisions.
 * Conditional writes enforce one-time use under concurrent requests.
 */
import crypto from 'node:crypto';
import type { PrismaClient, VerificationTokenType } from '@prisma/client';
import { env } from '../config/env.js';
import { limits } from '../config/limits.js';

type LinkTokenType = Exclude<VerificationTokenType, 'CONFIRM_CODE'>;

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * HMAC a short code with its issuance ID — the key blocks offline guessing;
 * the ID prevents unique-index collisions between identical codes.
 */
export function hashConfirmationCode(code: string, tokenId: string): string {
  return crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`signup-confirmation:${tokenId}:${code}`)
    .digest('hex');
}

function equalHashes(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

/** Outcome of checking a submitted sign-up confirmation code. */
export type ConfirmResult = 'ok' | 'invalid' | 'expired' | 'locked';

export class VerificationTokenService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Issue a fresh token of the given type, invalidating any prior unused tokens
   * of the same type for the user. Returns the RAW token (store only its hash).
   */
  async issue(userId: string, type: LinkTokenType): Promise<string> {
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
  async consume(raw: string, type: LinkTokenType): Promise<string | null> {
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
    const consumed = await this.prisma.verificationToken.updateMany({
      where: {
        id: token.id,
        type,
        usedAt: null,
        expiresAt: { gte: new Date() },
      },
      data: { usedAt: new Date() },
    });
    return consumed.count === 1 ? token.userId : null;
  }

  /**
   * Issue a fresh six-digit code, invalidating prior unused codes. The raw code
   * is returned once for delivery; only its keyed digest is persisted.
   */
  async issueCode(userId: string): Promise<string> {
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const tokenId = crypto.randomUUID();
    const tokenHash = hashConfirmationCode(code, tokenId);
    const expiresAt = new Date(Date.now() + limits.verificationTokenTtlMs.CONFIRM_CODE);

    await this.prisma.verificationToken.updateMany({
      where: { userId, type: 'CONFIRM_CODE', usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.verificationToken.create({
      data: { id: tokenId, userId, type: 'CONFIRM_CODE', tokenHash, expiresAt },
    });
    return code;
  }

  /**
   * Check a submitted code against the user's active confirmation code. A wrong
   * guess counts against the attempt ceiling ('locked' once reached); an expired
   * code reports 'expired' without counting. On 'ok' the code is consumed.
   */
  async verifyCode(userId: string, code: string): Promise<ConfirmResult> {
    const token = await this.prisma.verificationToken.findFirst({
      where: { userId, type: 'CONFIRM_CODE', usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!token) return 'invalid';
    if (token.expiresAt.getTime() < Date.now()) return 'expired';
    if (token.attempts >= limits.confirmCodeMaxAttempts) return 'locked';
    if (!equalHashes(token.tokenHash, hashConfirmationCode(code, token.id))) {
      await this.prisma.verificationToken.updateMany({
        where: {
          id: token.id,
          usedAt: null,
          attempts: { lt: limits.confirmCodeMaxAttempts },
        },
        data: { attempts: { increment: 1 } },
      });
      return 'invalid';
    }

    // The conditional write is the one-time-use boundary — concurrent correct
    // submissions may read the same row, but only one can consume it.
    const consumed = await this.prisma.verificationToken.updateMany({
      where: {
        id: token.id,
        usedAt: null,
        attempts: { lt: limits.confirmCodeMaxAttempts },
        expiresAt: { gte: new Date() },
      },
      data: { usedAt: new Date() },
    });
    return consumed.count === 1 ? 'ok' : 'invalid';
  }
}
