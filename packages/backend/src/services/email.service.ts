/**
 * Pluggable transactional email sender.
 *
 * When SMTP is configured (SMTP_HOST set) it sends via nodemailer; otherwise it
 * logs the message so verification/reset links are usable in local dev without
 * any provider. To switch to a hosted API (Resend/SendGrid/SES), replace the
 * body of `deliver` — every caller goes through it.
 */
import { env } from '../config/env.js';
import { limits } from '../config/limits.js';
import { logger } from '../config/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

async function deliver(msg: EmailMessage): Promise<void> {
  if (env.SMTP_HOST) {
    // Imported lazily so the dependency is only loaded when SMTP is in use.
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: env.SMTP_FROM ?? env.SMTP_USER,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return;
  }

  // No provider configured — log so the link works in dev. Never silently drop.
  logger.warn({ to: msg.to, subject: msg.subject }, `[email:dev] no SMTP configured — ${msg.text}`);
}

/**
 * Last code per address for non-production E2E/API tests. The paired route is
 * absent in production; normal auth responses never expose this value.
 */
const lastConfirmCode = new Map<string, string>();

export function readLastConfirmCode(email: string): string | null {
  return lastConfirmCode.get(email.toLowerCase()) ?? null;
}

export async function sendConfirmationCodeEmail(to: string, code: string): Promise<void> {
  const expiresInMinutes = Math.round(limits.verificationTokenTtlMs.CONFIRM_CODE / 60_000);
  if (env.NODE_ENV !== 'production') {
    lastConfirmCode.set(to.toLowerCase(), code);
  }
  await deliver({
    to,
    subject: 'Your RAMSey confirmation code',
    text: `Your RAMSey confirmation code is ${code}. It expires in ${expiresInMinutes} minutes.`,
    html:
      `<p>Your RAMSey confirmation code is:</p>` +
      `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>` +
      `<p>It expires in ${expiresInMinutes} minutes. If you didn’t request this, you can ignore this email.</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  await deliver({
    to,
    subject: 'Reset your RAMSey password',
    text: `Reset your RAMSey password (link expires in 1 hour): ${link}`,
    html: `<p>Reset your RAMSey password — this link expires in 1 hour:</p><p><a href="${link}">Reset password</a></p>`,
  });
}
