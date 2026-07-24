import { create } from 'zustand';

// Canvas background preference, persisted per browser (not per diagram).
export type BackgroundMode = 'dots' | 'grid' | 'none';

const STORAGE_KEY = 'ramsey-bg-mode';
const MINIMAP_KEY = 'ramsey-minimap';
const PALETTE_KEY = 'ramsey-palette';
const INSPECTOR_KEY = 'ramsey-inspector';
const PALETTE_WIDTH_KEY = 'ramsey-palette-width';
const INSPECTOR_WIDTH_KEY = 'ramsey-inspector-width';
const MODES: BackgroundMode[] = ['dots', 'grid', 'none'];

/** Tailwind's `sm`. Read once at load, like every other default here. */
const MOBILE_BREAKPOINT = 640;

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
}

/** Panel width bounds in px: below the min the contents stop fitting, above the
 *  max the canvas is squeezed for no gain.
 *
 *  On a phone the palette shows icons only, so it needs barely more than one
 *  icon of width. The inspector does NOT shrink to match: it holds the property
 *  form and the AI chat, which are the reasons to open a panel on mobile at all
 *  — matching the palette's width would make both unusable. */
const PALETTE_WIDTH = isMobileViewport()
  ? { initial: 76, min: 64, max: 240 }
  : { initial: 208, min: 160, max: 420 };
const INSPECTOR_WIDTH = isMobileViewport()
  ? { initial: 264, min: 200, max: 360 }
  : { initial: 288, min: 240, max: 560 };
type WidthBounds = typeof PALETTE_WIDTH;

function clamp(value: number, { min, max }: WidthBounds): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function loadWidth(key: string, bounds: WidthBounds): number {
  const stored = typeof localStorage !== 'undefined' ? Number(localStorage.getItem(key)) : NaN;
  return stored > 0 ? clamp(stored, bounds) : bounds.initial;
}

function load(): BackgroundMode {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return v === 'grid' || v === 'none' || v === 'dots' ? v : 'dots';
}

function loadMinimap(): boolean {
  // Off by default: small diagrams don't need it and it costs canvas space.
  return typeof localStorage !== 'undefined' && localStorage.getItem(MINIMAP_KEY) === 'on';
}

/**
 * Side panels are open unless the user collapsed them (stored as 'off') — but a
 * phone starts with both collapsed, since two panels plus a canvas leaves no
 * canvas. An explicit choice still wins on either.
 */
function loadPanel(key: string): boolean {
  if (typeof localStorage === 'undefined') return true;
  const stored = localStorage.getItem(key);
  if (stored === 'on') return true;
  if (stored === 'off') return false;
  return !isMobileViewport();
}

interface EditorPrefsStore {
  background: BackgroundMode;
  setBackground: (mode: BackgroundMode) => void;
  /** Cycle dots → grid → none → dots (toolbar button). */
  cycleBackground: () => void;

  minimap: boolean;
  toggleMinimap: () => void;

  /** Collapse the node palette (left) / the inspector (right) to give the
   *  canvas the full width. Persisted — a workspace layout choice. */
  palette: boolean;
  togglePalette: () => void;
  inspector: boolean;
  toggleInspector: () => void;

  /** Width of each panel while expanded, in px. Clamped by the setters, so a
   *  drag can be fed the raw pointer delta. Persisted alongside the collapse
   *  state — same workspace layout choice. */
  paletteWidth: number;
  setPaletteWidth: (px: number) => void;
  inspectorWidth: number;
  setInspectorWidth: (px: number) => void;

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

  palette: loadPanel(PALETTE_KEY),
  togglePalette: () => {
    const next = !get().palette;
    localStorage.setItem(PALETTE_KEY, next ? 'on' : 'off');
    set({ palette: next });
  },

  inspector: loadPanel(INSPECTOR_KEY),
  toggleInspector: () => {
    const next = !get().inspector;
    localStorage.setItem(INSPECTOR_KEY, next ? 'on' : 'off');
    set({ inspector: next });
  },

  paletteWidth: loadWidth(PALETTE_WIDTH_KEY, PALETTE_WIDTH),
  setPaletteWidth: (px) => {
    const next = clamp(px, PALETTE_WIDTH);
    localStorage.setItem(PALETTE_WIDTH_KEY, String(next));
    set({ paletteWidth: next });
  },

  inspectorWidth: loadWidth(INSPECTOR_WIDTH_KEY, INSPECTOR_WIDTH),
  setInspectorWidth: (px) => {
    const next = clamp(px, INSPECTOR_WIDTH);
    localStorage.setItem(INSPECTOR_WIDTH_KEY, String(next));
    set({ inspectorWidth: next });
  },

  // Transient UI state (not persisted).
  editing: null,
  startEditing: (kind, id) => set({ editing: { kind, id } }),
  stopEditing: () => set({ editing: null }),

  rightTab: 'properties',
  setRightTab: (tab) => set({ rightTab: tab }),
}));
