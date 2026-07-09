import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { captureException } from '../config/sentry.js';

/**
 * Base application error with HTTP status code.
 */
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found error.
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

/**
 * 403 Forbidden error.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

/**
 * 400 Validation error.
 */
export class ValidationError extends AppError {
  public readonly details: unknown;

  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400);
    this.details = details;
  }
}

/**
 * 401 Unauthorized error.
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

/**
 * 409 Conflict error.
 */
export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

/**
 * Global error handler for Fastify.
 * Maps application errors to proper HTTP responses.
 */
export function globalErrorHandler(
  error: FastifyError | AppError | Error,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  // Handle our custom AppError subclasses
  if (error instanceof ValidationError) {
    reply.status(error.statusCode).send({
      error: error.name,
      message: error.message,
      details: error.details ?? undefined,
      statusCode: error.statusCode,
    });
    return;
  }

  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: error.name,
      message: error.message,
      statusCode: error.statusCode,
    });
    return;
  }

  // Handle Fastify validation errors (from schema validation)
  const fastifyError = error as FastifyError;
  if (fastifyError.validation) {
    reply.status(400).send({
      error: 'ValidationError',
      message: 'Request validation failed',
      details: fastifyError.validation,
      statusCode: 400,
    });
    return;
  }

  // Handle Fastify errors with status codes
  if (fastifyError.statusCode) {
    reply.status(fastifyError.statusCode).send({
      error: fastifyError.name ?? 'Error',
      message: fastifyError.message,
      statusCode: fastifyError.statusCode,
    });
    return;
  }

  // Unknown/unexpected errors — log, report to Sentry (no-op without a DSN).
  _request.log.error(error, 'Unhandled error');
  captureException(error);

  reply.status(500).send({
    error: 'InternalServerError',
    message:
      process.env['NODE_ENV'] === 'production'
        ? 'An unexpected error occurred'
        : error.message,
    statusCode: 500,
  });
}
