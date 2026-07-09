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

export interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;

  addUserMessage: (content: string) => void;
  startAssistantMessage: () => string;
  appendToAssistantMessage: (id: string, text: string) => void;
  addToolCallToMessage: (id: string, toolCall: ToolCall) => void;
  finishAssistantMessage: (id: string) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let messageCounter = 0;

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isLoading: false,
  error: null,

  addUserMessage: (content: string) => {
    const id = `msg-${++messageCounter}`;
    set((state) => ({
      messages: [
        ...state.messages,
        { id, role: 'user', content },
      ],
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
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + text } : m,
      ),
    }));
  },

  addToolCallToMessage: (id: string, toolCall: ToolCall) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id
          ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] }
          : m,
      ),
    }));
  },

  finishAssistantMessage: (id: string) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, isStreaming: false } : m,
      ),
    }));
  },

  setError: (error: string | null) => {
    set({ error });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  clearMessages: () => {
    set({ messages: [], error: null });
  },
}));
