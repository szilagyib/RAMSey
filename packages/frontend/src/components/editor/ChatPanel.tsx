import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, Trash2, Wrench } from 'lucide-react';
import {
  beginTurn,
  endTurn,
  getChatSessionId,
  stopActiveTurn,
  useChatStore,
  type ChatError,
  type ToolCall,
} from '../../stores/chatStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { serializeDiagramContext } from '../../lib/diagramSerializer';
import { executeToolCall } from '../../lib/chatToolExecutor';
import { useCapabilities } from '../../lib/capabilities';
import { cn } from '../../lib/utils';
import { apiUrl } from '../../config/runtime';

// Mirror the backend chat.validation bounds so the UI fails fast instead of
// round-tripping to a 400. Keep these in sync with chat.validation.ts.
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 16;

// ---------------------------------------------------------------------------
// SSE stream consumer
// ---------------------------------------------------------------------------

async function sendChatRequest(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: ReturnType<typeof serializeDiagramContext>,
  sessionId: string,
  signal: AbortSignal,
  onTextDelta: (text: string) => void,
  onToolCall: (tc: ToolCall) => void,
  onError: (err: ChatError) => void,
  onDone: () => void,
) {
  const res = await fetch(apiUrl('/api/ai/chat'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, context, sessionId }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    onError({ message: body.error || `Request failed: ${res.status}` });
    onDone();
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError({ message: 'No response body' });
    onDone();
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const jsonStr = trimmed.slice(6);
      try {
        const event = JSON.parse(jsonStr);

        if (event.type === 'text_delta') {
          onTextDelta(event.text);
        } else if (event.type === 'tool_call') {
          onToolCall({
            id: event.id,
            name: event.name,
            input: event.input,
          });
        } else if (event.type === 'error') {
          onError({ message: event.message, code: event.code });
        } else if (event.type === 'done') {
          // Stream complete
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  onDone();
}

// ---------------------------------------------------------------------------
// Chat Panel Component
// ---------------------------------------------------------------------------

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const error = useChatStore((s) => s.error);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const startAssistantMessage = useChatStore((s) => s.startAssistantMessage);
  const appendToAssistantMessage = useChatStore((s) => s.appendToAssistantMessage);
  const addToolCallToMessage = useChatStore((s) => s.addToolCallToMessage);
  const finishAssistantMessage = useChatStore((s) => s.finishAssistantMessage);
  const setError = useChatStore((s) => s.setError);
  const setLoading = useChatStore((s) => s.setLoading);
  const clearMessages = useChatStore((s) => s.clearMessages);

  const { aiProviderLabel } = useCapabilities();

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Deliberately no abort on unmount: switching right-hand tabs unmounts this
  // panel, and a half-drawn diagram is worse than a request that finishes.
  const handleStop = useCallback(() => stopActiveTurn(), []);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    setInputValue('');
    addUserMessage(text);
    setLoading(true);

    // Get current diagram state for context
    const store = useDiagramStore.getState();
    const context = serializeDiagramContext(store.nodes, store.edges, store.diagramType);

    // Build messages for the API — only the most recent slice, matching the
    // backend's history cap so we don't send turns the server would drop.
    const chatMessages = useChatStore
      .getState()
      .messages.map((m) => ({ role: m.role, content: m.content }))
      .slice(-MAX_HISTORY_MESSAGES);

    const assistantMsgId = startAssistantMessage();
    const signal = beginTurn();

    try {
      await sendChatRequest(
        chatMessages,
        context,
        getChatSessionId(),
        signal,
        (delta) => {
          appendToAssistantMessage(assistantMsgId, delta);
        },
        (toolCall) => {
          addToolCallToMessage(assistantMsgId, toolCall);
          // Execute the tool call against the diagram store
          executeToolCall(toolCall, useDiagramStore.getState());
        },
        (err) => {
          setError(err);
        },
        () => {
          finishAssistantMessage(assistantMsgId);
          setLoading(false);
        },
      );
    } catch (err) {
      // Stopping is a deliberate user action: keep whatever was already drawn
      // and say nothing, rather than reporting a failure.
      if (!signal.aborted) {
        setError({ message: err instanceof Error ? err.message : 'Failed to send message' });
      }
      finishAssistantMessage(assistantMsgId);
      setLoading(false);
    } finally {
      endTurn();
    }
  }, [
    inputValue,
    isLoading,
    addUserMessage,
    startAssistantMessage,
    appendToAssistantMessage,
    addToolCallToMessage,
    finishAssistantMessage,
    setError,
    setLoading,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-200 px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">
          AI Assistant
        </h3>
        <button
          onClick={clearMessages}
          className="rounded p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600"
          title="Clear chat"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-surface-400">Ask the AI to help with your diagram.</p>
            <p className="mt-2 text-xs text-surface-300">
              Try: &quot;Create a Markov chain for a redundant pump system&quot;
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'mb-3 rounded-lg px-3 py-2 text-sm',
              msg.role === 'user'
                ? 'ml-6 bg-primary-50 text-primary-900'
                : 'mr-6 bg-surface-100 text-surface-800',
            )}
          >
            <div className="mb-1 text-xs font-medium text-surface-400">
              {msg.role === 'user' ? 'You' : 'AI'}
            </div>
            <div className="whitespace-pre-wrap">{msg.content}</div>

            {/* Tool calls */}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mt-2 space-y-1">
                {msg.toolCalls.map((tc) => (
                  <div
                    key={tc.id}
                    className="flex items-center gap-1.5 rounded bg-surface-200/50 px-2 py-1 text-xs text-surface-500"
                  >
                    <Wrench className="h-3 w-3" />
                    <span className="font-medium">{formatToolName(tc.name)}</span>
                    <span className="truncate text-surface-400">{formatToolArgs(tc)}</span>
                  </div>
                ))}
              </div>
            )}

            {msg.isStreaming && (
              <span className="inline-block h-4 w-1 animate-pulse bg-surface-400" />
            )}
          </div>
        ))}

        {error && (
          <div
            role="status"
            className={cn(
              'mb-3 rounded-lg px-3 py-2 text-sm',
              // A spent budget or an unconfigured provider is an expected state,
              // not a fault — red would misrepresent both.
              error.code === 'budget_exceeded' || error.code === 'not_configured'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-red-50 text-red-700',
            )}
          >
            {error.message}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-surface-200 p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI..."
            rows={1}
            maxLength={MAX_MESSAGE_CHARS}
            className={cn(
              'flex-1 resize-none rounded-md border border-surface-300 px-3 py-2 text-sm',
              'placeholder-surface-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500',
              'disabled:opacity-50',
            )}
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              onClick={handleStop}
              title="Stop generating"
              aria-label="Stop generating"
              className={cn(
                'flex items-center justify-center rounded-md px-3 py-2',
                'bg-surface-200 text-surface-700 hover:bg-surface-300',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
              )}
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              title="Send"
              aria-label="Send"
              className={cn(
                'flex items-center justify-center rounded-md px-3 py-2',
                'bg-primary-600 text-white hover:bg-primary-700',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* Names the real destination, which varies by deployment — see
            aiProviderLabel in /api/capabilities. */}
        {aiProviderLabel && (
          <p className="mt-1.5 text-[10px] leading-snug text-surface-300">
            Messages and the open diagram are sent to {aiProviderLabel} to generate responses.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ');
}

function formatToolArgs(tc: ToolCall): string {
  const { input, name } = tc;
  if (name === 'add_node') {
    return `${input.subType}${input.label ? ` "${input.label}"` : ''}`;
  }
  if (name === 'add_edge') {
    return `${input.source} → ${input.target}`;
  }
  if (name === 'remove_node') {
    return `${input.nodeId}`;
  }
  if (name === 'update_node') {
    return `${input.nodeId}`;
  }
  if (name === 'clear_diagram') {
    return '';
  }
  return JSON.stringify(input).slice(0, 50);
}
