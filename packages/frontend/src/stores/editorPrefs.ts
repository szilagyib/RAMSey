import { create } from 'zustand';

// Canvas background preference, persisted per browser (not per diagram).
export type BackgroundMode = 'dots' | 'grid' | 'none';

const STORAGE_KEY = 'ramsey-bg-mode';
const MINIMAP_KEY = 'ramsey-minimap';
const MODES: BackgroundMode[] = ['dots', 'grid', 'none'];

function load(): BackgroundMode {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return v === 'grid' || v === 'none' || v === 'dots' ? v : 'dots';
}

function loadMinimap(): boolean {
  // Off by default: small diagrams don't need it and it costs canvas space.
  return typeof localStorage !== 'undefined' && localStorage.getItem(MINIMAP_KEY) === 'on';
}

interface EditorPrefsStore {
  background: BackgroundMode;
  setBackground: (mode: BackgroundMode) => void;
  /** Cycle dots → grid → none → dots (toolbar button). */
  cycleBackground: () => void;

  minimap: boolean;
  toggleMinimap: () => void;

  /** Element whose label is being edited in place (double-click), if any. */
  editing: { kind: 'node' | 'edge'; id: string } | null;
  startEditing: (kind: 'node' | 'edge', id: string) => void;
  stopEditing: () => void;

  /** Which sidebar tab is showing. Analysis lives here rather than in a card
   *  floating over the canvas, so running it never hides the diagram. */
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;
}

export type RightTab = 'properties' | 'analysis' | 'chat';

export const useEditorPrefs = create<EditorPrefsStore>((set, get) => ({
  background: load(),
  setBackground: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    set({ background: mode });
  },
  cycleBackground: () => {
    const next = MODES[(MODES.indexOf(get().background) + 1) % MODES.length];
    get().setBackground(next);
  },

  minimap: loadMinimap(),
  toggleMinimap: () => {
    const next = !get().minimap;
    localStorage.setItem(MINIMAP_KEY, next ? 'on' : 'off');
    set({ minimap: next });
  },

  // Transient UI state (not persisted).
  editing: null,
  startEditing: (kind, id) => set({ editing: { kind, id } }),
  stopEditing: () => set({ editing: null }),

  rightTab: 'properties',
  setRightTab: (tab) => set({ rightTab: tab }),
}));
