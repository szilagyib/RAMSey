import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Mirrors the backend's StreamErrorCode (ai.service.ts). */
export type ChatErrorCode = 'not_configured' | 'budget_exceeded' | 'provider_error';

/**
 * `code` separates an expected limit from a fault: a spent AI budget is normal
 * and is shown as a notice, not as a red failure.
 */
export interface ChatError {
  message: string;
  code?: ChatErrorCode;
}

export interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  error: ChatError | null;

  addUserMessage: (content: string) => void;
  startAssistantMessage: () => string;
  appendToAssistantMessage: (id: string, text: string) => void;
  addToolCallToMessage: (id: string, toolCall: ToolCall) => void;
  finishAssistantMessage: (id: string) => void;
  setError: (error: ChatError | null) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let messageCounter = 0;

/**
 * The in-flight turn's abort handle. Module-level rather than component state on
 * purpose: the panel unmounts whenever the user switches to another right-hand
 * tab, and a turn must survive that — it keeps drawing on the canvas, and Stop
 * has to still work when the user comes back. Not part of render state, so it
 * lives outside the store's reactive fields.
 */
let activeTurn: AbortController | null = null;

export function beginTurn(): AbortSignal {
  activeTurn = new AbortController();
  return activeTurn.signal;
}

export function endTurn(): void {
  activeTurn = null;
}

/** Cancels the streaming turn, if any. Safe to call when nothing is running. */
export function stopActiveTurn(): void {
  activeTurn?.abort();
  activeTurn = null;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isLoading: false,
  error: null,

  addUserMessage: (content: string) => {
    const id = `msg-${++messageCounter}`;
    set((state) => ({
      messages: [...state.messages, { id, role: 'user', content }],
      error: null,
    }));
  },

  startAssistantMessage: () => {
    const id = `msg-${++messageCounter}`;
    set((state) => ({
      messages: [
        ...state.messages,
        { id, role: 'assistant', content: '', isStreaming: true, toolCalls: [] },
      ],
    }));
    return id;
  },

  appendToAssistantMessage: (id: string, text: string) => {
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, content: m.content + text } : m)),
    }));
  },

  addToolCallToMessage: (id: string, toolCall: ToolCall) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] } : m,
      ),
    }));
  },

  finishAssistantMessage: (id: string) => {
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, isStreaming: false } : m)),
    }));
  },

  setError: (error: ChatError | null) => {
    set({ error });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  clearMessages: () => {
    set({ messages: [], error: null });
  },
}));
