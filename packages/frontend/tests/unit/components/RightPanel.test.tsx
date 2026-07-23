import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Toggle these per test; the mocks below read them at render time.
const mocks = vi.hoisted(() => ({ aiChat: false, rightTab: 'properties' as string }));

// Stub the child panels so the test isolates RightPanel's tab gating from their
// stores/contexts. Each renders a sentinel string we can assert on.
vi.mock('../../../src/components/editor/PropertyPanel', () => ({
  PropertyPanel: () => <div>PROPERTIES</div>,
}));
vi.mock('../../../src/components/editor/AnalysisPanel', () => ({
  AnalysisPanel: () => <div>ANALYSIS</div>,
}));
vi.mock('../../../src/components/editor/ChatPanel', () => ({
  ChatPanel: () => <div>CHATPANEL</div>,
}));
vi.mock('../../../src/components/editor/PanelResizer', () => ({ PanelResizer: () => null }));

vi.mock('../../../src/lib/capabilities', () => ({
  useCapabilities: () => ({
    aiChat: mocks.aiChat,
    aiProviderLabel: mocks.aiChat ? 'OpenAI' : null,
    serverAnalysis: true,
    googleOAuth: false,
  }),
}));

interface PrefsState {
  rightTab: string;
  setRightTab: () => void;
  inspector: boolean;
  toggleInspector: () => void;
  inspectorWidth: number;
  setInspectorWidth: () => void;
}
vi.mock('../../../src/stores/editorPrefs', () => ({
  useEditorPrefs: (selector: (s: PrefsState) => unknown) =>
    selector({
      rightTab: mocks.rightTab,
      setRightTab: () => {},
      inspector: true,
      toggleInspector: () => {},
      inspectorWidth: 320,
      setInspectorWidth: () => {},
    }),
}));

import { RightPanel } from '../../../src/components/editor/RightPanel';

afterEach(cleanup);
beforeEach(() => {
  mocks.aiChat = false;
  mocks.rightTab = 'properties';
});

// When AI is disabled (AI_CHAT_ENABLED=false or no provider), the capability is
// off and NOTHING about AI mode may appear.
describe('RightPanel — AI gating', () => {
  it('hides the AI Chat tab and panel when aiChat is off', () => {
    mocks.aiChat = false;
    render(<RightPanel />);
    expect(screen.queryByText('AI Chat')).toBeNull();
    expect(screen.queryByText('CHATPANEL')).toBeNull();
  });

  it('shows the AI Chat tab when aiChat is on', () => {
    mocks.aiChat = true;
    render(<RightPanel />);
    expect(screen.getByText('AI Chat')).toBeTruthy();
  });

  // A stale 'chat' selection must not leave a blank panel once AI is disabled.
  it('falls back to Properties when chat was active but AI is off', () => {
    mocks.aiChat = false;
    mocks.rightTab = 'chat';
    render(<RightPanel />);
    expect(screen.queryByText('CHATPANEL')).toBeNull();
    expect(screen.getByText('PROPERTIES')).toBeTruthy();
  });
});
