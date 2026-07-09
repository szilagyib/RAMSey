import { create } from 'zustand';
import type { FMEARow } from '../types/diagram';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface FMEAStore {
  // State
  rows: FMEARow[];
  selectedRowId: string | null;

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

export const useFMEAStore = create<FMEAStore>((set) => ({
  rows: [],
  selectedRowId: null,

  addRow: () => {
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
    set((state) => ({
      rows: state.rows.filter((row) => row.id !== id),
      selectedRowId: state.selectedRowId === id ? null : state.selectedRowId,
    }));
  },

  selectRow: (id) => {
    set({ selectedRowId: id });
  },

  loadRows: (rows) => {
    set({ rows, selectedRowId: null });
  },
}));
