/**
 * Pluggable transactional email sender.
 *
 * When SMTP is configured (SMTP_HOST set) it sends via nodemailer; otherwise it
 * logs the message so verification/reset links are usable in local dev without
 * any provider. To switch to a hosted API (Resend/SendGrid/SES), replace the
 * body of `deliver` — every caller goes through it.
 */
import { env } from '../config/env.js';
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

export async function sendVerificationEmail(to: string, link: string): Promise<void> {
  await deliver({
    to,
    subject: 'Verify your RAMSey email address',
    text: `Confirm your RAMSey email address: ${link}`,
    html: `<p>Confirm your RAMSey email address:</p><p><a href="${link}">Verify email</a></p>`,
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
