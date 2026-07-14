import pino from 'pino';
import type { LoggerOptions } from 'pino';

function buildLoggerOptions(): LoggerOptions {
  const isDevelopment = !process.env['NODE_ENV'] || process.env['NODE_ENV'] === 'development';

  const baseOptions: LoggerOptions = {
    level: process.env['LOG_LEVEL'] ?? (isDevelopment ? 'debug' : 'info'),
    timestamp: pino.stdTimeFunctions.isoTime,
    // Never log secrets, even if something logs raw headers/bodies.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        'res.headers["set-cookie"]',
        'password',
        '*.password',
        'token',
        '*.token',
      ],
      censor: '[redacted]',
    },
    // Compact request/response logging in BOTH dev and prod — and crucially this
    // means headers (cookies, auth) are never serialized into request logs.
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          hostname: req.hostname,
          remoteAddress: req.ip,
          requestId: req.id,
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  };

  if (isDevelopment) {
    return {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    };
  }

  // Production: structured JSON with an explicit level label.
  return {
    ...baseOptions,
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
  };
}

export const loggerOptions = buildLoggerOptions();

export const logger = pino(loggerOptions);
