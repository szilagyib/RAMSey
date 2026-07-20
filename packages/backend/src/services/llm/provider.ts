/**
 * Provider-neutral LLM interface. Adapters (Anthropic, OpenAI) translate these
 * normalized shapes to and from their SDKs; the chat orchestration in
 * ai.service.ts is written against this interface and never sees a provider SDK.
 *
 * Streaming, unlike a plain request/response interface: a human watches the chat
 * panel, and the client applies each tool call as it arrives, so nodes appear on
 * the canvas incrementally. Buffering a whole turn would remove that.
 */

export type LlmProviderId = 'anthropic' | 'openai';

export interface LlmSystemBlock {
  text: string;
  /** Anthropic prompt-cache hint; ignored by providers that cache automatically. */
  cacheable?: boolean;
}

export interface LlmToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * A conversation turn. The `assistant` turn keeps its text and tool calls so an
 * adapter can replay it in its native format on the next tool round.
 */
export type LlmMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; text: string; toolCalls: LlmToolCall[] }
  | { role: 'tool_result'; toolCallId: string; content: string };

export interface LlmMessageRequest {
  model: string;
  maxTokens: number;
  system: LlmSystemBlock[];
  messages: LlmMessage[];
  tools?: LlmToolSpec[];
}

export type LlmStopReason = 'end' | 'max_tokens' | 'tool_use' | 'other';

/**
 * Input/output only: the chat_usage ledger charges `inputTokens + outputTokens`,
 * so cache-read and cache-write tokens fold into `inputTokens` rather than
 * changing what an existing ledger row means.
 */
export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Events yielded while a turn streams. `done` arrives exactly once, last, even
 * when the provider reports no usage (the fields are then zero).
 */
export type LlmStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'done'; stopReason: LlmStopReason; usage: NormalizedUsage };

export interface LlmProvider {
  readonly id: LlmProviderId;
  /**
   * Stream one assistant turn. Aborting `signal` must stop the underlying
   * request; consumers treat an aborted stream as "no further events".
   */
  streamMessage(req: LlmMessageRequest, signal?: AbortSignal): AsyncIterable<LlmStreamEvent>;
}
