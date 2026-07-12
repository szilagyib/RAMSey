import { create } from 'zustand';

// Canvas background preference, persisted per browser (not per diagram).
export type BackgroundMode = 'dots' | 'grid' | 'none';

const STORAGE_KEY = 'ramsey-bg-mode';
const MODES: BackgroundMode[] = ['dots', 'grid', 'none'];

function load(): BackgroundMode {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return v === 'grid' || v === 'none' || v === 'dots' ? v : 'dots';
}

interface EditorPrefsStore {
  background: BackgroundMode;
  setBackground: (mode: BackgroundMode) => void;
  /** Cycle dots → grid → none → dots (toolbar button). */
  cycleBackground: () => void;
}

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
}));
