import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LlmMessageRequest, LlmStreamEvent } from '../../../../src/services/llm/provider.js';

const createMock = vi.fn();

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

const { OpenAiProvider } = await import('../../../../src/services/llm/openai.js');

/** A chat-completion chunk, loosely typed — only the fields the adapter reads. */
type Chunk = Record<string, unknown>;

function streamOf(...chunks: Chunk[]) {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}

/** Text delta chunk. */
const text = (content: string): Chunk => ({ choices: [{ delta: { content } }] });

/** Tool-call fragment chunk. */
const toolFragment = (
  index: number,
  fragment: { id?: string; name?: string; args?: string },
): Chunk => ({
  choices: [
    {
      delta: {
        tool_calls: [
          {
            index,
            ...(fragment.id ? { id: fragment.id } : {}),
            function: {
              ...(fragment.name ? { name: fragment.name } : {}),
              ...(fragment.args ? { arguments: fragment.args } : {}),
            },
          },
        ],
      },
    },
  ],
});

const finish = (reason: string): Chunk => ({ choices: [{ delta: {}, finish_reason: reason }] });

/** The usage-only chunk OpenAI sends last; note the empty choices array. */
const usageChunk = (prompt: number, completion: number): Chunk => ({
  choices: [],
  usage: { prompt_tokens: prompt, completion_tokens: completion },
});

const baseRequest: LlmMessageRequest = {
  model: 'gpt-4.1-mini',
  maxTokens: 2048,
  system: [{ text: 'constitution', cacheable: true }],
  messages: [{ role: 'user', content: 'hi' }],
};

function provider() {
  return new OpenAiProvider({ apiKey: 'sk-test' });
}

async function collect(req: LlmMessageRequest = baseRequest): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const event of provider().streamMessage(req)) events.push(event);
  return events;
}

/** The request body handed to the SDK — only what these assertions read. */
interface SentBody {
  stream?: unknown;
  stream_options?: unknown;
  max_completion_tokens?: unknown;
  max_tokens?: unknown;
  tools?: unknown;
  messages: Record<string, unknown>[];
}

function sentBody(): SentBody {
  return createMock.mock.calls[0][0] as SentBody;
}

beforeEach(() => {
  createMock.mockReset();
});

describe('OpenAiProvider — request translation', () => {
  it('asks for usage, without which the cost ceiling would charge zero', async () => {
    createMock.mockResolvedValue(streamOf(finish('stop'), usageChunk(10, 5)));
    await collect();
    expect(sentBody().stream).toBe(true);
    expect(sentBody().stream_options).toEqual({ include_usage: true });
  });

  it('uses max_completion_tokens, which newer models require', async () => {
    createMock.mockResolvedValue(streamOf(finish('stop')));
    await collect();
    expect(sentBody().max_completion_tokens).toBe(2048);
    expect(sentBody().max_tokens).toBeUndefined();
  });

  it('merges system blocks into one leading system message', async () => {
    createMock.mockResolvedValue(streamOf(finish('stop')));
    await collect({
      ...baseRequest,
      system: [{ text: 'first' }, { text: 'second' }],
    });
    expect(sentBody().messages[0]).toEqual({ role: 'system', content: 'first\n\nsecond' });
  });

  it('omits tools entirely when none are supplied', async () => {
    createMock.mockResolvedValue(streamOf(finish('stop')));
    await collect();
    expect(sentBody().tools).toBeUndefined();
  });

  it('replays an assistant turn with its tool calls, then the results', async () => {
    createMock.mockResolvedValue(streamOf(finish('stop')));
    await collect({
      ...baseRequest,
      messages: [
        { role: 'user', content: 'build it' },
        {
          role: 'assistant',
          text: 'adding',
          toolCalls: [{ id: 'call_1', name: 'add_node', input: { subType: 'block' } }],
        },
        { role: 'tool_result', toolCallId: 'call_1', content: '{"success":true}' },
      ],
    });

    const messages = sentBody().messages;
    expect(messages[2]).toEqual({
      role: 'assistant',
      content: 'adding',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'add_node', arguments: '{"subType":"block"}' },
        },
      ],
    });
    expect(messages[3]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"success":true}',
    });
  });

  it('sends null content for a tool-only assistant turn', async () => {
    createMock.mockResolvedValue(streamOf(finish('stop')));
    await collect({
      ...baseRequest,
      messages: [
        { role: 'user', content: 'go' },
        { role: 'assistant', text: '', toolCalls: [] },
      ],
    });
    expect(sentBody().messages[2].content).toBeNull();
  });
});

describe('OpenAiProvider — streaming', () => {
  it('passes text deltas through in order', async () => {
    createMock.mockResolvedValue(
      streamOf(text('Build'), text('ing '), text('it'), finish('stop'), usageChunk(10, 5)),
    );
    const events = await collect();
    expect(events.filter((e) => e.type === 'text_delta').map((e) => e.text)).toEqual([
      'Build',
      'ing ',
      'it',
    ]);
  });

  it('assembles a tool call from argument fragments', async () => {
    createMock.mockResolvedValue(
      streamOf(
        toolFragment(0, { id: 'call_1', name: 'add_node', args: '{"subT' }),
        toolFragment(0, { args: 'ype":"bl' }),
        toolFragment(0, { args: 'ock"}' }),
        finish('tool_calls'),
        usageChunk(100, 20),
      ),
    );
    const events = await collect();
    expect(events[0]).toEqual({
      type: 'tool_call',
      id: 'call_1',
      name: 'add_node',
      input: { subType: 'block' },
    });
  });

  // Waiting for the whole round would make the canvas draw in one batch; a call
  // is complete the moment a later index starts.
  it('emits a completed call before the stream ends', async () => {
    createMock.mockResolvedValue(
      streamOf(
        toolFragment(0, { id: 'call_1', name: 'add_node', args: '{"subType":"block"}' }),
        toolFragment(1, { id: 'call_2', name: 'add_edge', args: '{"source":"a",' }),
        text('still going'),
        toolFragment(1, { args: '"target":"b"}' }),
        finish('tool_calls'),
        usageChunk(100, 20),
      ),
    );
    const events = await collect();

    // call_1 lands before the text that streamed while call_2 was still arriving.
    expect(events.map((e) => e.type)).toEqual(['tool_call', 'text_delta', 'tool_call', 'done']);
    expect(events[0]).toMatchObject({ id: 'call_1', input: { subType: 'block' } });
    expect(events[2]).toMatchObject({ id: 'call_2', input: { source: 'a', target: 'b' } });
  });

  it('keeps parallel calls in index order', async () => {
    createMock.mockResolvedValue(
      streamOf(
        toolFragment(0, { id: 'c0', name: 'add_node', args: '{}' }),
        toolFragment(1, { id: 'c1', name: 'add_node', args: '{}' }),
        toolFragment(2, { id: 'c2', name: 'add_node', args: '{}' }),
        finish('tool_calls'),
        usageChunk(1, 1),
      ),
    );
    const events = await collect();
    expect(events.filter((e) => e.type === 'tool_call').map((e) => e.id)).toEqual([
      'c0',
      'c1',
      'c2',
    ]);
  });

  it('treats an empty argument string as an empty object', async () => {
    createMock.mockResolvedValue(
      streamOf(
        toolFragment(0, { id: 'c0', name: 'validate_diagram' }),
        finish('tool_calls'),
        usageChunk(1, 1),
      ),
    );
    const events = await collect();
    expect(events[0]).toMatchObject({ name: 'validate_diagram', input: {} });
  });

  it('drops a call whose arguments never parse rather than emitting garbage', async () => {
    createMock.mockResolvedValue(
      streamOf(
        toolFragment(0, { id: 'c0', name: 'add_node', args: '{"subType":' }),
        finish('tool_calls'),
        usageChunk(1, 1),
      ),
    );
    const events = await collect();
    expect(events.filter((e) => e.type === 'tool_call')).toEqual([]);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('drops a fragment that never received an id', async () => {
    createMock.mockResolvedValue(
      streamOf(toolFragment(0, { args: '{}' }), finish('tool_calls'), usageChunk(1, 1)),
    );
    const events = await collect();
    expect(events.filter((e) => e.type === 'tool_call')).toEqual([]);
  });
});

describe('OpenAiProvider — completion', () => {
  it('reports usage from the trailing usage-only chunk', async () => {
    createMock.mockResolvedValue(streamOf(text('hi'), finish('stop'), usageChunk(1234, 56)));
    const events = await collect();
    expect(events.at(-1)).toEqual({
      type: 'done',
      stopReason: 'end',
      usage: { inputTokens: 1234, outputTokens: 56 },
    });
  });

  it('reports zero usage when the endpoint omits it', async () => {
    createMock.mockResolvedValue(streamOf(text('hi'), finish('stop')));
    expect(events(await collect()).usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it.each([
    ['stop', 'end'],
    ['length', 'max_tokens'],
    ['tool_calls', 'tool_use'],
    ['content_filter', 'other'],
  ])('maps finish_reason %s to %s', async (reason, expected) => {
    createMock.mockResolvedValue(streamOf(finish(reason), usageChunk(1, 1)));
    expect(events(await collect()).stopReason).toBe(expected);
  });

  it('forwards the abort signal to the SDK', async () => {
    createMock.mockResolvedValue(streamOf(finish('stop')));
    const controller = new AbortController();
    for await (const _ of provider().streamMessage(baseRequest, controller.signal)) void _;
    expect(createMock.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });
});

/** The terminating `done` event, which is always last. */
function events(all: LlmStreamEvent[]): Extract<LlmStreamEvent, { type: 'done' }> {
  const last = all.at(-1);
  if (last?.type !== 'done') throw new Error(`expected done last, got ${last?.type}`);
  return last;
}
