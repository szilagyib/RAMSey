import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { streamChat, type TokenUsage } from '../services/ai.service.js';
import { validateChatRequest } from './chat.validation.js';
import { ChatBudgetService } from '../services/chat-budget.service.js';
import { describeAiConfig } from '../services/llm/config.js';
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
      // When AI chat is disabled (AI_CHAT_ENABLED=false or no provider resolves)
      // the endpoint is unavailable — mirrors server-side analysis' 503, and is
      // checked before any budget query or SSE headers. The UI already hides the
      // tab; this is the clean refusal for a hand-crafted request.
      if (!describeAiConfig(process.env).configured) {
        return reply.status(503).send({ error: 'AI chat is not available' });
      }

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

      // Streaming to the raw socket bypasses Fastify's reply, which would drop
      // every header its onRequest hooks set — CORS (@fastify/cors) and the
      // security headers (@fastify/helmet). Missing CORS makes a cross-origin
      // browser reject the stream ("Failed to fetch"); missing helmet headers
      // silently weakens the response. Re-apply everything Fastify accumulated,
      // then set the SSE-specific headers (setHeader overwrites any same-named).
      for (const [name, value] of Object.entries(reply.getHeaders())) {
        if (value !== undefined) reply.raw.setHeader(name, value);
      }
      reply.raw.setHeader('content-type', 'text/event-stream');
      reply.raw.setHeader('cache-control', 'no-cache');
      reply.raw.setHeader('connection', 'keep-alive');
      reply.raw.setHeader('x-accel-buffering', 'no');
      reply.raw.writeHead(200);

      if (!decision.allowed) {
        // Expected, not a fault — but log it so an operator can see who is
        // hitting which tier (e.g. to spot a cap that needs tuning).
        fastify.log.info({ userId, tier: decision.tier }, 'AI chat budget exceeded');
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
      // A write can still lose the race between the canWrite() check and the
      // write itself if the socket tears down in between; without a listener
      // that surfaces as an unhandled 'error' on the raw stream. Swallow it —
      // a client that hung up mid-stream is expected, not a failure.
      reply.raw.on('error', () => {
        /* client disconnected mid-write; nothing to do */
      });

      // An abrupt disconnect destroys the socket without setting writableEnded,
      // and writing to a destroyed response emits an unhandled 'error'. Both
      // conditions have to be checked before every write.
      const canWrite = () => !reply.raw.writableEnded && !reply.raw.destroyed;

      let usage: TokenUsage | undefined;
      try {
        for await (const event of streamChat(messages, context, abort.signal)) {
          if (event.type === 'done') usage = event.usage;
          // Drain to the end even with nobody listening, rather than breaking:
          // usage arrives on the final event, so bailing out early on a dropped
          // connection would leave the turn unrecorded and therefore free. The
          // abort above already stops the upstream call, so this ends promptly.
          if (canWrite()) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
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
        } else {
          // A cancelled turn tears down with an expected error, so it's not
          // logged as a failure — but record it at debug so a genuine error that
          // coincides with an abort isn't wholly invisible.
          fastify.log.debug({ err }, 'AI chat stream ended after abort');
        }
      }

      // Charge the budget for whatever was actually spent (best-effort).
      if (usage && usage.totalTokens > 0) {
        try {
          await budget.record(userId, sessionId, usage);
        } catch (err) {
          fastify.log.error(err, 'failed to record chat usage');
        }
      } else if (!abort.signal.aborted) {
        // A completed turn that reports no tokens means the provider returned no
        // usage — nothing gets recorded, so the cost ceiling silently stops
        // enforcing. Most likely an OpenAI-compatible endpoint that ignores
        // stream_options.include_usage (see docs/OPERATIONS.md).
        fastify.log.warn(
          { userId },
          'chat turn reported zero tokens — AI budget is not being enforced',
        );
      }

      // Already gone when the client hung up or pressed Stop.
      if (canWrite()) reply.raw.end();
    },
  );
};

export default chatRoutes;
