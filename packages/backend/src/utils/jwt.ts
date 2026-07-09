import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JwtPayload {
  userId: string;
  email: string;
  name?: string;
  /**
   * User.tokenVersion at sign time. authenticate() rejects tokens whose version
   * no longer matches, which is how password reset / account deletion revoke
   * every outstanding session. Optional for tokens issued before this field
   * existed (treated as 0).
   */
  tokenVersion?: number;
}

export const COOKIE_NAME = 'ramsey_token';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 604800,
};

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
