import { create } from 'zustand';
import type { FMEARow } from '../types/diagram';
import { DEFAULT_RPN_THRESHOLDS, normalizeThresholds, type RpnThresholds } from '../lib/fmea';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface FMEAStore {
  // State
  rows: FMEARow[];
  selectedRowId: string | null;

  // Undo/redo (bounded snapshot stacks; same design as diagramStore)
  undoStack: FMEARow[][];
  redoStack: FMEARow[][];
  recordHistory: (tag?: string | null) => void;
  undo: () => void;
  redo: () => void;

  /** Risk-band boundaries for the RPN column; a per-browser preference. */
  rpnThresholds: RpnThresholds;
  setRpnThresholds: (next: RpnThresholds) => void;

  // Actions
  addRow: () => void;
  updateRow: (id: string, partial: Partial<Omit<FMEARow, 'id' | 'rpn'>>) => void;
  deleteRow: (id: string) => void;
  selectRow: (id: string | null) => void;
  loadRows: (rows: FMEARow[]) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

const HISTORY_LIMIT = 100;
/** Same-tag records inside this sliding window merge into one undo entry. */
const COALESCE_MS = 800;

let historyTag: string | null = null;
let historyTagTime = 0;

// Thresholds are a reviewer preference, not diagram data, so they live per
// browser alongside the other editor preferences rather than in the document.
const RPN_THRESHOLDS_KEY = 'ramsey-fmea-rpn-thresholds';

function loadThresholds(): RpnThresholds {
  try {
    const raw = localStorage.getItem(RPN_THRESHOLDS_KEY);
    if (!raw) return DEFAULT_RPN_THRESHOLDS;
    const parsed = JSON.parse(raw) as Partial<RpnThresholds>;
    if (typeof parsed.medium !== 'number' || typeof parsed.high !== 'number') {
      return DEFAULT_RPN_THRESHOLDS;
    }
    return normalizeThresholds({ medium: parsed.medium, high: parsed.high });
  } catch {
    // Unreadable or blocked storage is not worth failing the editor over.
    return DEFAULT_RPN_THRESHOLDS;
  }
}

export const useFMEAStore = create<FMEAStore>((set, get) => ({
  rows: [],
  selectedRowId: null,
  undoStack: [],
  redoStack: [],
  rpnThresholds: loadThresholds(),

  setRpnThresholds: (next) => {
    const thresholds = normalizeThresholds(next);
    try {
      localStorage.setItem(RPN_THRESHOLDS_KEY, JSON.stringify(thresholds));
    } catch {
      // Preference just won't persist; the session still uses it.
    }
    set({ rpnThresholds: thresholds });
  },

  /**
   * Capture the CURRENT rows as an undo entry — call before mutating. A tag
   * coalesces repeated calls (cell-typing bursts) into one entry; null always
   * starts a fresh entry. Any new entry clears the redo stack.
   */
  recordHistory: (tag = null) => {
    const now = Date.now();
    if (tag !== null && tag === historyTag && now - historyTagTime < COALESCE_MS) {
      historyTagTime = now;
      return;
    }
    historyTag = tag;
    historyTagTime = now;
    set((state) => ({
      undoStack: [...state.undoStack.slice(-(HISTORY_LIMIT - 1)), state.rows],
      redoStack: [],
    }));
  },

  undo: () => {
    const state = get();
    const prev = state.undoStack[state.undoStack.length - 1];
    if (!prev) return;
    historyTag = null;
    set({
      rows: prev,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, state.rows].slice(-HISTORY_LIMIT),
      selectedRowId: null,
    });
  },

  redo: () => {
    const state = get();
    const next = state.redoStack[state.redoStack.length - 1];
    if (!next) return;
    historyTag = null;
    set({
      rows: next,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, state.rows].slice(-HISTORY_LIMIT),
      selectedRowId: null,
    });
  },

  addRow: () => {
    get().recordHistory();
    const newRow: FMEARow = {
      id: `fmea-row-${Date.now()}`,
      item: '',
      function: '',
      failureMode: '',
      effect: '',
      severity: 1,
      occurrence: 1,
      detection: 1,
      rpn: 1,
      actions: '',
    };
    set((state) => ({ rows: [...state.rows, newRow] }));
  },

  updateRow: (id, partial) => {
    // Tagged per row+field: a typing burst in one cell is one undo entry.
    get().recordHistory(`row:${id}:${Object.keys(partial).join(',')}`);
    set((state) => ({
      rows: state.rows.map((row) => {
        if (row.id !== id) return row;

        const updated = { ...row, ...partial };
        updated.rpn = updated.severity * updated.occurrence * updated.detection;
        return updated;
      }),
    }));
  },

  deleteRow: (id) => {
    get().recordHistory();
    set((state) => ({
      rows: state.rows.filter((row) => row.id !== id),
      selectedRowId: state.selectedRowId === id ? null : state.selectedRowId,
    }));
  },

  selectRow: (id) => {
    set({ selectedRowId: id });
  },

  loadRows: (rows) => {
    // A load is a new editing context — clear history with it.
    historyTag = null;
    set({ rows, selectedRowId: null, undoStack: [], redoStack: [] });
  },
}));
