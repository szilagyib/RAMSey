/**
 * Validation + defensive bounds for the AI chat endpoint.
 *
 * Pure and dependency-free so it can be unit-tested in isolation. All numeric
 * bounds come from config/limits (the single source of truth) — nothing is
 * hard-coded here.
 */
import type { ChatMessage, DiagramContext } from '../services/ai.service.js';
import { limits } from '../config/limits.js';

export type ChatValidationResult =
  | { ok: true; messages: ChatMessage[]; context: DiagramContext; sessionId?: string }
  | { ok: false; error: string };

function validateMessages(raw: unknown): ChatMessage[] | string {
  if (!Array.isArray(raw)) return 'messages must be an array';
  if (raw.length === 0) return 'messages must not be empty';
  if (raw.length > limits.chat.maxRawMessages) return 'too many messages';

  const cleaned: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return 'invalid message';
    const m = item as { role?: unknown; content?: unknown };
    if (m.role !== 'user' && m.role !== 'assistant') return 'invalid message role';
    if (typeof m.content !== 'string' || m.content.trim().length === 0) {
      return 'message content must be a non-empty string';
    }
    if (m.content.length > limits.chat.maxMessageChars) {
      return `message exceeds ${limits.chat.maxMessageChars} characters`;
    }
    cleaned.push({ role: m.role, content: m.content });
  }

  // We're answering the user's latest turn, so it must come from the user.
  if (cleaned[cleaned.length - 1].role !== 'user') {
    return 'the last message must be from the user';
  }

  // Keep only the most recent slice, then drop any leading assistant turns so
  // the forwarded conversation starts with a user message (Anthropic requires it).
  let sliced = cleaned.slice(-limits.chat.maxHistoryMessages);
  while (sliced.length > 0 && sliced[0].role !== 'user') {
    sliced = sliced.slice(1);
  }
  if (sliced.length === 0) return 'no valid messages after trimming';

  return sliced;
}

function validateContext(raw: unknown): DiagramContext | string {
  if (!raw || typeof raw !== 'object') return 'context is required';
  const c = raw as Partial<DiagramContext>;
  if (typeof c.diagramType !== 'string' || c.diagramType.trim().length === 0) {
    return 'context.diagramType is required';
  }
  const nodes = Array.isArray(c.nodes) ? c.nodes : [];
  const edges = Array.isArray(c.edges) ? c.edges : [];
  if (nodes.length > limits.chat.maxContextNodes) return 'diagram has too many nodes';
  if (edges.length > limits.chat.maxContextEdges) return 'diagram has too many edges';

  return {
    diagramType: c.diagramType,
    diagramName: typeof c.diagramName === 'string' ? c.diagramName : undefined,
    nodes,
    edges,
  };
}

/**
 * Validate and normalise a raw chat request body. Returns the cleaned,
 * history-trimmed payload (plus an optional client session id for the AI cost
 * ceiling) or a short error string suitable for a 400 response.
 */
export function validateChatRequest(raw: unknown): ChatValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'request body must be an object' };
  }
  const body = raw as { messages?: unknown; context?: unknown; sessionId?: unknown };

  const messages = validateMessages(body.messages);
  if (typeof messages === 'string') return { ok: false, error: messages };

  const context = validateContext(body.context);
  if (typeof context === 'string') return { ok: false, error: context };

  let sessionId: string | undefined;
  if (body.sessionId !== undefined) {
    if (typeof body.sessionId !== 'string' || body.sessionId.length > limits.chat.maxSessionIdChars) {
      return { ok: false, error: 'invalid sessionId' };
    }
    sessionId = body.sessionId;
  }

  return { ok: true, messages, context, sessionId };
}
