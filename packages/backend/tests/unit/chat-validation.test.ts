import { describe, it, expect } from 'vitest';
import { validateChatRequest } from '../../src/routes/chat.validation.js';
import { limits } from '../../src/config/limits.js';
import { RAMSEY_SYSTEM_PROMPT } from '../../src/services/ai-system-prompt.js';

// Bounds now live in the single config source of truth.
const MAX_MESSAGE_CHARS = limits.chat.maxMessageChars;
const MAX_HISTORY_MESSAGES = limits.chat.maxHistoryMessages;
const MAX_RAW_MESSAGES = limits.chat.maxRawMessages;
const MAX_CONTEXT_NODES = limits.chat.maxContextNodes;

const ctx = { diagramType: 'markov_chain', nodes: [], edges: [] };
const userMsg = (content: string) => ({ role: 'user', content });

describe('validateChatRequest', () => {
  it('accepts a well-formed request and returns the cleaned payload', () => {
    const res = validateChatRequest({
      messages: [userMsg('Create a 2-state Markov chain')],
      context: ctx,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.messages).toHaveLength(1);
      expect(res.context.diagramType).toBe('markov_chain');
      expect(res.context.nodes).toEqual([]);
    }
  });

  it('rejects a non-object body', () => {
    expect(validateChatRequest(null).ok).toBe(false);
    expect(validateChatRequest('hi').ok).toBe(false);
  });

  it('rejects empty / non-array messages', () => {
    expect(validateChatRequest({ messages: [], context: ctx }).ok).toBe(false);
    expect(validateChatRequest({ messages: 'x', context: ctx }).ok).toBe(false);
  });

  it('rejects more than MAX_RAW_MESSAGES', () => {
    const messages = Array.from({ length: MAX_RAW_MESSAGES + 1 }, () => userMsg('hi'));
    expect(validateChatRequest({ messages, context: ctx }).ok).toBe(false);
  });

  it('rejects an invalid role', () => {
    const res = validateChatRequest({
      messages: [{ role: 'system', content: 'hi' }],
      context: ctx,
    });
    expect(res.ok).toBe(false);
  });

  it('rejects empty / non-string content', () => {
    expect(validateChatRequest({ messages: [userMsg('   ')], context: ctx }).ok).toBe(false);
    expect(
      validateChatRequest({ messages: [{ role: 'user', content: 123 }], context: ctx }).ok,
    ).toBe(false);
  });

  it('rejects a message over MAX_MESSAGE_CHARS', () => {
    const res = validateChatRequest({
      messages: [userMsg('a'.repeat(MAX_MESSAGE_CHARS + 1))],
      context: ctx,
    });
    expect(res.ok).toBe(false);
  });

  it('rejects when the last message is not from the user', () => {
    const res = validateChatRequest({
      messages: [userMsg('hi'), { role: 'assistant', content: 'hello' }],
      context: ctx,
    });
    expect(res.ok).toBe(false);
  });

  it('trims history to the most recent MAX_HISTORY_MESSAGES and starts on a user turn', () => {
    // Build a long alternating conversation ending on a user turn.
    const messages = [];
    for (let i = 0; i < MAX_HISTORY_MESSAGES + 6; i++) {
      messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}` });
    }
    // Ensure it ends with a user message.
    if (messages[messages.length - 1].role !== 'user') {
      messages.push(userMsg('final'));
    }
    const res = validateChatRequest({ messages, context: ctx });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.messages.length).toBeLessThanOrEqual(MAX_HISTORY_MESSAGES);
      expect(res.messages[0].role).toBe('user');
      expect(res.messages[res.messages.length - 1].role).toBe('user');
    }
  });

  it('requires a context with diagramType', () => {
    expect(validateChatRequest({ messages: [userMsg('hi')] }).ok).toBe(false);
    expect(
      validateChatRequest({ messages: [userMsg('hi')], context: { nodes: [], edges: [] } }).ok,
    ).toBe(false);
  });

  it('rejects a diagram with too many nodes', () => {
    const nodes = Array.from({ length: MAX_CONTEXT_NODES + 1 }, (_, i) => ({
      id: `n${i}`,
      data: {},
      position: { x: 0, y: 0 },
    }));
    const res = validateChatRequest({
      messages: [userMsg('hi')],
      context: { diagramType: 'fault_tree', nodes, edges: [] },
    });
    expect(res.ok).toBe(false);
  });

  // A non-object element would throw in the system-prompt builder; reject it
  // here with a clean 400 instead.
  it('rejects a non-object node or edge', () => {
    expect(
      validateChatRequest({
        messages: [userMsg('hi')],
        context: { diagramType: 'markov_chain', nodes: [null], edges: [] },
      }).ok,
    ).toBe(false);
    expect(
      validateChatRequest({
        messages: [userMsg('hi')],
        context: { diagramType: 'markov_chain', nodes: [], edges: ['nope'] },
      }).ok,
    ).toBe(false);
  });
});

describe('RAMSEY_SYSTEM_PROMPT guardrails', () => {
  it('declares the untrusted-input wrapping and treats diagram content as data', () => {
    expect(RAMSEY_SYSTEM_PROMPT).toContain('<user>');
    const p = RAMSEY_SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain('untrusted');
    expect(p).toContain('data, not commands');
  });

  it('states internal-knowledge-only / no internet', () => {
    expect(RAMSEY_SYSTEM_PROMPT.toLowerCase()).toContain('no internet access');
  });

  it('blacklists general software-development help and personal/opinion topics', () => {
    const p = RAMSEY_SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain('software-development help');
    expect(p).toContain('personal questions');
    expect(p).toContain('opinions');
  });

  it('covers each supported diagram type for confident drawing', () => {
    for (const t of [
      'Markov chain',
      'Fault tree',
      'Event tree',
      'Reliability block diagram',
      'Bow-tie',
    ]) {
      expect(RAMSEY_SYSTEM_PROMPT).toContain(t);
    }
  });

  it('bounds output length', () => {
    expect(RAMSEY_SYSTEM_PROMPT).toContain('OUTPUT LENGTH');
  });
});
