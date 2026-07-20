import Anthropic from '@anthropic-ai/sdk';
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

export interface AnthropicProviderOptions {
  apiKey: string;
  baseURL?: string;
}

/** Adapter over @anthropic-ai/sdk (Messages API, streaming). */
export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic;

  constructor(opts: AnthropicProviderOptions) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
  }

  async *streamMessage(
    req: LlmMessageRequest,
    signal?: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    const stream = this.client.messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system: toSystem(req.system),
        messages: toMessages(req.messages),
        ...(req.tools?.length ? { tools: toTools(req.tools) } : {}),
      },
      { signal },
    );

    // Tool input arrives as JSON fragments across input_json_delta events; hold
    // the partial until content_block_stop closes the block.
    let toolId = '';
    let toolName = '';
    let toolJson = '';

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        toolId = event.content_block.id;
        toolName = event.content_block.name;
        toolJson = '';
        continue;
      }

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          toolJson += event.delta.partial_json;
        }
        continue;
      }

      if (event.type === 'content_block_stop' && toolName) {
        const input = parseToolInput(toolJson);
        if (input) yield { type: 'tool_call', id: toolId, name: toolName, input };
        toolId = '';
        toolName = '';
        toolJson = '';
      }
    }

    const final = await stream.finalMessage();
    yield {
      type: 'done',
      stopReason: toStopReason(final.stop_reason),
      usage: toUsage(final.usage),
    };
  }
}

function toSystem(system: LlmSystemBlock[]): Anthropic.TextBlockParam[] {
  return system.map((block) => ({
    type: 'text' as const,
    text: block.text,
    ...(block.cacheable ? { cache_control: { type: 'ephemeral' as const } } : {}),
  }));
}

function toTools(tools: LlmToolSpec[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool.InputSchema,
  }));
}

function toMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.content });
      continue;
    }
    if (message.role === 'assistant') {
      const content: Anthropic.ContentBlockParam[] = [];
      if (message.text) content.push({ type: 'text', text: message.text });
      for (const call of message.toolCalls) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
      }
      out.push({ role: 'assistant', content });
      continue;
    }
    // tool_result — coalesce consecutive results into one user turn, as the
    // Messages API expects every result for an assistant turn together.
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: message.toolCallId,
      content: message.content,
    };
    const last = out[out.length - 1];
    if (last && last.role === 'user' && Array.isArray(last.content)) {
      last.content.push(block);
    } else {
      out.push({ role: 'user', content: [block] });
    }
  }
  return out;
}

function parseToolInput(raw: string): Record<string, unknown> | null {
  // A tool call with no arguments emits no input_json_delta at all.
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
    case 'end_turn':
    case 'stop_sequence':
      return 'end';
    case 'max_tokens':
      return 'max_tokens';
    case 'tool_use':
      return 'tool_use';
    default:
      return 'other';
  }
}

// Cache reads/writes are billed differently but still count as input for the
// token budget, so they fold into inputTokens rather than being dropped.
function toUsage(usage: Anthropic.Usage | undefined): NormalizedUsage {
  return {
    inputTokens:
      (usage?.input_tokens ?? 0) +
      (usage?.cache_creation_input_tokens ?? 0) +
      (usage?.cache_read_input_tokens ?? 0),
    outputTokens: usage?.output_tokens ?? 0,
  };
}
