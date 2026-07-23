import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LlmMessageRequest, LlmStreamEvent } from '../../../../src/services/llm/provider.js';

const streamMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: streamMock };
  },
}));

const { AnthropicProvider } = await import('../../../../src/services/llm/anthropic.js');

/** A Messages-API stream event, loosely typed — only the fields the adapter reads. */
type Event = Record<string, unknown>;

interface FinalMessage {
  stop_reason: string | null;
  usage?: Record<string, number>;
}

/** The SDK's stream object: an async-iterable EventEmitter, plus finalMessage(). */
function streamOf(events: Event[], final: FinalMessage) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
    finalMessage: async () => final,
    // MessageStream is an EventEmitter; the adapter attaches a no-op 'error'
    // listener to avoid an unhandled 'error' crash on abort. on() returns this.
    on() {
      return this;
    },
  };
}

const text = (t: string): Event => ({
  type: 'content_block_delta',
  delta: { type: 'text_delta', text: t },
});

const toolStart = (id: string, name: string): Event => ({
  type: 'content_block_start',
  content_block: { type: 'tool_use', id, name },
});

const toolJson = (partial_json: string): Event => ({
  type: 'content_block_delta',
  delta: { type: 'input_json_delta', partial_json },
});

const blockStop: Event = { type: 'content_block_stop' };

const baseRequest: LlmMessageRequest = {
  model: 'claude-sonnet-4-5-20250929',
  maxTokens: 2048,
  system: [{ text: 'constitution', cacheable: true }],
  messages: [{ role: 'user', content: 'hi' }],
};

function provider() {
  return new AnthropicProvider({ apiKey: 'sk-ant-test' });
}

async function collect(
  events: Event[],
  final: FinalMessage,
  req: LlmMessageRequest = baseRequest,
): Promise<LlmStreamEvent[]> {
  streamMock.mockReturnValue(streamOf(events, final));
  const out: LlmStreamEvent[] = [];
  for await (const event of provider().streamMessage(req)) out.push(event);
  return out;
}

/** The request body handed to the SDK — only what these assertions read. */
interface SentBody {
  system?: unknown;
  tools?: unknown;
  messages: Record<string, unknown>[];
}

function sentBody(): SentBody {
  return streamMock.mock.calls[0][0] as SentBody;
}

const ended: FinalMessage = {
  stop_reason: 'end_turn',
  usage: { input_tokens: 0, output_tokens: 0 },
};

beforeEach(() => {
  streamMock.mockReset();
});

describe('AnthropicProvider — request translation', () => {
  it('marks a cacheable system block for the prompt cache', async () => {
    await collect([], ended);
    expect(sentBody().system).toEqual([
      { type: 'text', text: 'constitution', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('leaves a non-cacheable block unmarked', async () => {
    await collect([], ended, { ...baseRequest, system: [{ text: 'plain' }] });
    expect(sentBody().system).toEqual([{ type: 'text', text: 'plain' }]);
  });

  it('maps tool specs onto input_schema', async () => {
    await collect([], ended, {
      ...baseRequest,
      tools: [{ name: 'add_node', description: 'Add', parameters: { type: 'object' } }],
    });
    expect(sentBody().tools).toEqual([
      { name: 'add_node', description: 'Add', input_schema: { type: 'object' } },
    ]);
  });

  it('rebuilds an assistant turn as text plus tool_use blocks', async () => {
    await collect([], ended, {
      ...baseRequest,
      messages: [
        { role: 'user', content: 'build it' },
        {
          role: 'assistant',
          text: 'adding',
          toolCalls: [{ id: 'tu_1', name: 'add_node', input: { subType: 'block' } }],
        },
        { role: 'tool_result', toolCallId: 'tu_1', content: '{"success":true}' },
      ],
    });
    expect(sentBody().messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'adding' },
        { type: 'tool_use', id: 'tu_1', name: 'add_node', input: { subType: 'block' } },
      ],
    });
  });

  // The Messages API rejects a turn whose results are split across user turns.
  it('coalesces consecutive tool results into one user turn', async () => {
    await collect([], ended, {
      ...baseRequest,
      messages: [
        { role: 'user', content: 'go' },
        { role: 'assistant', text: '', toolCalls: [] },
        { role: 'tool_result', toolCallId: 'tu_1', content: 'a' },
        { role: 'tool_result', toolCallId: 'tu_2', content: 'b' },
      ],
    });
    const messages = sentBody().messages;
    expect(messages).toHaveLength(3);
    expect(messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'a' },
        { type: 'tool_result', tool_use_id: 'tu_2', content: 'b' },
      ],
    });
  });

  it('forwards the abort signal to the SDK', async () => {
    streamMock.mockReturnValue(streamOf([], ended));
    const controller = new AbortController();
    for await (const _ of provider().streamMessage(baseRequest, controller.signal)) void _;
    expect(streamMock.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });
});

describe('AnthropicProvider — streaming', () => {
  it('passes text deltas through in order', async () => {
    const events = await collect([text('Build'), text('ing')], ended);
    expect(events.filter((e) => e.type === 'text_delta').map((e) => e.text)).toEqual([
      'Build',
      'ing',
    ]);
  });

  it('assembles a tool call from input_json_delta fragments', async () => {
    const events = await collect(
      [toolStart('tu_1', 'add_node'), toolJson('{"subT'), toolJson('ype":"block"}'), blockStop],
      { stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } },
    );
    expect(events[0]).toEqual({
      type: 'tool_call',
      id: 'tu_1',
      name: 'add_node',
      input: { subType: 'block' },
    });
  });

  it('emits each call as its block closes, so the canvas draws progressively', async () => {
    const events = await collect(
      [
        toolStart('tu_1', 'add_node'),
        toolJson('{}'),
        blockStop,
        text('and now'),
        toolStart('tu_2', 'add_edge'),
        toolJson('{}'),
        blockStop,
      ],
      { stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } },
    );
    expect(events.map((e) => e.type)).toEqual(['tool_call', 'text_delta', 'tool_call', 'done']);
  });

  it('treats a no-argument call as an empty object', async () => {
    const events = await collect([toolStart('tu_1', 'validate_diagram'), blockStop], {
      stop_reason: 'tool_use',
    });
    expect(events[0]).toMatchObject({ name: 'validate_diagram', input: {} });
  });

  it('drops a call whose arguments never parse', async () => {
    const events = await collect([toolStart('tu_1', 'add_node'), toolJson('{"a":'), blockStop], {
      stop_reason: 'tool_use',
    });
    expect(events.filter((e) => e.type === 'tool_call')).toEqual([]);
  });

  // A text block also closes with content_block_stop; only tool blocks should emit.
  it('ignores the block stop that closes a text block', async () => {
    const events = await collect([text('hello'), blockStop], ended);
    expect(events.map((e) => e.type)).toEqual(['text_delta', 'done']);
  });
});

describe('AnthropicProvider — completion', () => {
  it('counts cache reads and writes as input, since the budget bills them', async () => {
    const events = await collect([], {
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 300,
      },
    });
    expect(events.at(-1)).toEqual({
      type: 'done',
      stopReason: 'end',
      usage: { inputTokens: 900, outputTokens: 20 },
    });
  });

  it('reports zero usage when the response carries none', async () => {
    const events = await collect([], { stop_reason: 'end_turn' });
    expect(events.at(-1)).toMatchObject({ usage: { inputTokens: 0, outputTokens: 0 } });
  });

  it.each([
    ['end_turn', 'end'],
    ['stop_sequence', 'end'],
    ['max_tokens', 'max_tokens'],
    ['tool_use', 'tool_use'],
    ['refusal', 'other'],
  ])('maps stop_reason %s to %s', async (reason, expected) => {
    const events = await collect([], { stop_reason: reason });
    expect(events.at(-1)).toMatchObject({ stopReason: expected });
  });
});
