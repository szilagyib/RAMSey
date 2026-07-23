import OpenAI from 'openai';
import type {
  LlmMessage,
  LlmMessageRequest,
  LlmProvider,
  LlmStopReason,
  LlmStreamEvent,
  LlmSystemBlock,
  LlmToolSpec,
  NormalizedUsage,
} from './provider.js';

export interface OpenAiProviderOptions {
  apiKey: string;
  baseURL?: string;
}

/** A tool call being assembled from streamed fragments. */
interface PartialToolCall {
  id: string;
  name: string;
  args: string;
}

/**
 * Adapter over the openai SDK (Chat Completions, streaming). Works against any
 * OpenAI-compatible endpoint via `baseURL` — Azure, OpenRouter, Ollama, vLLM.
 */
export class OpenAiProvider implements LlmProvider {
  readonly id = 'openai' as const;
  private client: OpenAI;

  constructor(opts: OpenAiProviderOptions) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
  }

  async *streamMessage(
    req: LlmMessageRequest,
    signal?: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    const stream = await this.client.chat.completions.create(
      {
        model: req.model,
        // Newer models require max_completion_tokens; temperature is intentionally omitted.
        max_completion_tokens: req.maxTokens,
        messages: toMessages(req.system, req.messages),
        ...(req.tools?.length ? { tools: toTools(req.tools) } : {}),
        stream: true,
        // Without this, a streamed response carries no usage at all and the AI
        // cost ceiling would silently charge zero for every turn.
        stream_options: { include_usage: true },
      },
      { signal },
    );

    // Tool calls stream as fragments keyed by `index`: `id` and `function.name`
    // appear once, `function.arguments` arrives in pieces. Emit a call as soon
    // as a later index starts (the earlier one can receive nothing more), so the
    // client draws nodes progressively instead of in one batch at the end.
    const pending = new Map<number, PartialToolCall>();
    let usage: NormalizedUsage = { inputTokens: 0, outputTokens: 0 };
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      // The final usage-only chunk carries an empty choices array.
      if (chunk.usage) usage = toUsage(chunk.usage);

      const choice = chunk.choices[0];
      if (!choice) continue;

      if (choice.delta?.content) {
        yield { type: 'text_delta', text: choice.delta.content };
      }

      for (const fragment of choice.delta?.tool_calls ?? []) {
        const index = fragment.index;

        for (const call of takeCallsBefore(pending, index)) {
          yield call;
        }

        const partial = pending.get(index) ?? { id: '', name: '', args: '' };
        if (fragment.id) partial.id = fragment.id;
        if (fragment.function?.name) partial.name = fragment.function.name;
        if (fragment.function?.arguments) partial.args += fragment.function.arguments;
        pending.set(index, partial);
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    for (const call of takeCallsBefore(pending, Infinity)) {
      yield call;
    }

    yield { type: 'done', stopReason: toStopReason(finishReason), usage };
  }
}

/**
 * Remove and convert every pending call whose index is below `limit`, in index
 * order. A call missing its id or name was never really started, so it is
 * dropped rather than emitted half-formed.
 */
function* takeCallsBefore(
  pending: Map<number, PartialToolCall>,
  limit: number,
): Generator<Extract<LlmStreamEvent, { type: 'tool_call' }>> {
  const ready = [...pending.keys()].filter((i) => i < limit).sort((a, b) => a - b);
  for (const index of ready) {
    const partial = pending.get(index)!;
    pending.delete(index);
    if (!partial.id || !partial.name) continue;
    const input = parseArguments(partial.args);
    if (input) yield { type: 'tool_call', id: partial.id, name: partial.name, input };
  }
}

function toMessages(
  system: LlmSystemBlock[],
  messages: LlmMessage[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (system.length) {
    out.push({ role: 'system', content: system.map((b) => b.text).join('\n\n') });
  }
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.content });
    } else if (message.role === 'assistant') {
      const assistant: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: 'assistant',
        content: message.text.length > 0 ? message.text : null,
      };
      if (message.toolCalls.length) {
        assistant.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        }));
      }
      out.push(assistant);
    } else {
      out.push({ role: 'tool', tool_call_id: message.toolCallId, content: message.content });
    }
  }
  return out;
}

function toTools(tools: LlmToolSpec[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function parseArguments(raw: string): Record<string, unknown> | null {
  // A no-argument tool call streams either nothing or an empty object.
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toStopReason(reason: string | null): LlmStopReason {
  switch (reason) {
    case 'stop':
      return 'end';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
      return 'tool_use';
    default:
      return 'other';
  }
}

// prompt_tokens already includes cached tokens, so no adjustment is needed: the
// budget charges total input regardless of how it was billed.
function toUsage(usage: OpenAI.Completions.CompletionUsage): NormalizedUsage {
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
  };
}
