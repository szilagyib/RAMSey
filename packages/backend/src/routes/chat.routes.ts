import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { streamChat, type TokenUsage } from '../services/ai.service.js';
import { validateChatRequest } from './chat.validation.js';
import { ChatBudgetService } from '../services/chat-budget.service.js';
import { limits } from '../config/limits.js';

const chatRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * POST /api/ai/chat
   * Streaming AI chat endpoint. Returns server-sent events (SSE).
   *
   * Body:
   *   messages: Array of { role: 'user' | 'assistant', content: string }
   *   context: { diagramType, diagramName?, nodes, edges }
   *   sessionId?: stable id for the chat session (for the per-session budget)
   *
   * Response: text/event-stream with NDJSON events.
   *
   * Guards: requires auth, validates + bounds the body (chat.validation), a
   * tighter per-route rate limit, and the AI cost ceiling (chat-budget) — the
   * endpoint is expensive (LLM calls), so a budget check runs before any tokens
   * are spent and usage is recorded after.
   */
  fastify.post(
    '/api/ai/chat',
    {
      preHandler: [authenticate],
      config: { rateLimit: limits.rateLimits.chat },
    },
    async (request, reply) => {
      const validation = validateChatRequest(request.body);
      if (!validation.ok) {
        reply.status(400);
        return { error: validation.error };
      }
      const { messages, context } = validation;
      const userId = request.user!.id;
      // A stable client session id drives the per-session tier; fall back to a
      // per-request id so the cap still applies for clients that omit it.
      const sessionId = validation.sessionId ?? crypto.randomUUID();
      const budget = new ChatBudgetService(fastify.prisma);

      // Enforce the cost ceiling before spending any tokens.
      const decision = await budget.check(userId, sessionId);

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      if (!decision.allowed) {
        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'error',
            message: decision.message,
            code: 'budget_exceeded',
          })}\n\n`,
        );
        reply.raw.end();
        return;
      }

      // Stopping the stream (Stop button, closed tab, dropped connection) must
      // abort the upstream LLM request too, or tokens keep being billed for
      // output nobody will read.
      const abort = new AbortController();
      reply.raw.on('close', () => abort.abort());

      // An abrupt disconnect destroys the socket without setting writableEnded,
      // and writing to a destroyed response emits an unhandled 'error'. Both
      // conditions have to be checked before every write.
      const canWrite = () => !reply.raw.writableEnded && !reply.raw.destroyed;

      let usage: TokenUsage | undefined;
      try {
        for await (const event of streamChat(messages, context, abort.signal)) {
          // Read usage before bailing out, so a cancelled turn is still charged.
          if (event.type === 'done') usage = event.usage;
          if (!canWrite()) break;
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (err) {
        // An abort is the expected end of a cancelled turn, not a failure.
        if (!abort.signal.aborted) {
          // Upstream SDK errors can carry request URLs, headers and model
          // details; keep those in structured logs rather than reflecting them
          // to the browser, as the readiness check already does.
          fastify.log.error(err, 'AI chat stream failed');
          if (canWrite()) {
            reply.raw.write(
              `data: ${JSON.stringify({
                type: 'error',
                message: 'The AI provider could not be reached. Please try again.',
                code: 'provider_error',
              })}\n\n`,
            );
          }
        }
      }

      // Charge the budget for whatever was actually spent (best-effort).
      if (usage && usage.totalTokens > 0) {
        try {
          await budget.record(userId, sessionId, usage);
        } catch (err) {
          fastify.log.error(err, 'failed to record chat usage');
        }
      }

      // Already gone when the client hung up or pressed Stop.
      if (canWrite()) reply.raw.end();
    },
  );
};

export default chatRoutes;
