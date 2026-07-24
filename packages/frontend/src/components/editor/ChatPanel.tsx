import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Send, Square, Eraser, Wrench, Sparkles } from 'lucide-react';
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
import { useAuth } from '../../contexts/auth';
import { cn } from '../../lib/utils';
import { apiUrl } from '../../config/runtime';

// Mirror the backend chat.validation bounds so the UI fails fast instead of
// round-tripping to a 400. Keep these in sync with chat.validation.ts.
const MAX_MESSAGE_CHARS = 2000;
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
  const { isGuest } = useAuth();

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
    if (!text || isLoading || isGuest || text.length > MAX_MESSAGE_CHARS) return;

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

    // Collapse every tool call this turn applies into ONE undo/redo step, so a
    // generated diagram reverts in a single undo instead of one per node/edge.
    // A text-only reply mutates nothing, so the group records nothing.
    useDiagramStore.getState().beginHistoryGroup();

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
      useDiagramStore.getState().endHistoryGroup();
      endTurn();
    }
  }, [
    inputValue,
    isLoading,
    isGuest,
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

  // Trimmed, because that is what actually gets sent and what the server bounds.
  const messageLength = inputValue.trim().length;
  const isTooLong = messageLength > MAX_MESSAGE_CHARS;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-200 bg-primary-50/60 px-4 py-2 dark:bg-primary-500/10">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-surface-600">
          <Sparkles className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
          AI
        </h3>
        <button
          onClick={clearMessages}
          className="rounded p-1 text-surface-400 hover:bg-surface-200 hover:text-surface-700"
          title="Clear chat"
          aria-label="Clear chat"
        >
          <Eraser className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 &&
          (isGuest ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <p className="text-sm font-medium text-surface-700">
                The AI assistant requires an account.
              </p>
              <Link
                to="/login"
                className="mt-3 inline-flex items-center rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
              >
                Log in or sign up
              </Link>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm text-surface-500">Ask AI to help with your diagram.</p>
              <p className="mt-2 text-xs text-surface-400">
                Try: &quot;Model a redundant pump system with a standby unit&quot;
              </p>
            </div>
          ))}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'mb-3 rounded-lg px-3 py-2 text-sm',
              msg.role === 'user'
                ? 'ml-6 bg-primary-600 text-white'
                : 'mr-6 bg-surface-100 text-surface-800 dark:bg-surface-200',
            )}
          >
            <div
              className={cn(
                'mb-1 text-xs font-medium',
                msg.role === 'user' ? 'text-primary-100' : 'text-surface-500',
              )}
            >
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

            {/* A bare blinking caret didn't read as "working". Say so, and
                distinguish waiting for the first token from writing the reply. */}
            {msg.isStreaming && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-surface-500">
                <span className="flex gap-0.5">
                  {[-0.3, -0.15, 0].map((delay) => (
                    <span
                      key={delay}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-500"
                      style={{ animationDelay: `${delay}s` }}
                    />
                  ))}
                </span>
                {msg.content ? 'Writing…' : 'Thinking…'}
              </div>
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
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
            )}
          >
            {error.message}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-surface-200 p-3">
        {/* items-end keeps the send/stop button at the bottom rather than
            stretching it to the full height of the multi-row input. */}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isGuest ? 'Sign in to use the AI assistant' : 'Ask AI...'}
            rows={3}
            className={cn(
              'flex-1 resize-none rounded-md border border-surface-300 px-3 py-2 text-sm',
              'placeholder-surface-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500',
              'disabled:opacity-50',
            )}
            disabled={isLoading || isGuest}
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
              disabled={!inputValue.trim() || isTooLong || isGuest}
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
        {isTooLong && (
          <p role="alert" className="mt-1.5 text-[11px] leading-snug text-red-600">
            Message is too long — {messageLength.toLocaleString()}/
            {MAX_MESSAGE_CHARS.toLocaleString()} characters. Shorten it to send.
          </p>
        )}
        {/* Names the real destination, which varies by deployment — see
            aiProviderLabel in /api/capabilities. */}
        {aiProviderLabel && !isGuest && (
          <p className="mt-1.5 text-[11px] leading-snug text-surface-500">
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
