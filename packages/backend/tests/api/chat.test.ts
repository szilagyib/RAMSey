import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, authHeaders } from '../helpers/setup.js';

const url = '/api/ai/chat';
const json = { 'content-type': 'application/json' };
const body = {
  messages: [{ role: 'user', content: 'hi' }],
  context: { diagramType: 'markov_chain', nodes: [], edges: [] },
};

// These env vars drive describeAiConfig(process.env); each test sets what it
// needs. Snapshot + restore so the mutations can't leak into other files.
const AI_VARS = ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'ANTHROPIC_API_KEY', 'AI_CHAT_ENABLED'];

describe('AI chat route — availability guard', () => {
  let app: FastifyInstance;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const k of AI_VARS) saved[k] = process.env[k];
    app = (await createTestApp()).app;
  });

  afterAll(async () => {
    await app.close();
    for (const k of AI_VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  // Every test starts with AI unconfigured; it opts into a config it needs.
  beforeEach(() => {
    for (const k of AI_VARS) delete process.env[k];
  });

  it('returns 503 when AI is not configured', async () => {
    const res = await app.inject({ method: 'POST', url, headers: { ...authHeaders(), ...json }, payload: body });
    expect(res.statusCode).toBe(503);
  });

  it('returns 503 when disabled by AI_CHAT_ENABLED=false, even with a key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.AI_CHAT_ENABLED = 'false';
    const res = await app.inject({ method: 'POST', url, headers: { ...authHeaders(), ...json }, payload: body });
    expect(res.statusCode).toBe(503);
  });

  // Guard passes when configured, so a bad body reaches validation (400) rather
  // than being short-circuited — and without any call to the provider.
  it('passes the guard when configured — invalid body is a 400, not a 503', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const res = await app.inject({ method: 'POST', url, headers: { ...authHeaders(), ...json }, payload: { messages: [], context: {} } });
    expect(res.statusCode).toBe(400);
  });

  it('requires authentication before anything else', async () => {
    const res = await app.inject({ method: 'POST', url, headers: json, payload: body });
    expect(res.statusCode).toBe(401);
  });
});
