import { describe, it, expect, beforeEach } from 'vitest';
import { useFMEAStore } from '../../../src/stores/fmeaStore';

const state = () => useFMEAStore.getState();

describe('FMEA undo/redo', () => {
  beforeEach(() => {
    // loadRows resets rows, selection, stacks and the coalescing tag.
    state().loadRows([]);
  });

  it('undoes and redoes adding a row', () => {
    state().addRow();
    expect(state().rows).toHaveLength(1);
    expect(state().undoStack).toHaveLength(1);

    state().undo();
    expect(state().rows).toHaveLength(0);

    state().redo();
    expect(state().rows).toHaveLength(1);
  });

  it('coalesces a typing burst in one cell into one entry', () => {
    state().addRow();
    const id = state().rows[0].id;
    state().updateRow(id, { item: 'P' });
    state().updateRow(id, { item: 'Pu' });
    state().updateRow(id, { item: 'Pump' });
    expect(state().undoStack).toHaveLength(2); // add + one coalesced edit

    state().undo();
    expect(state().rows[0].item).toBe('');
  });

  it('keeps edits in different cells as separate entries', () => {
    state().addRow();
    const id = state().rows[0].id;
    state().updateRow(id, { item: 'Pump' });
    state().updateRow(id, { severity: 7 });
    expect(state().undoStack).toHaveLength(3);
  });

  it('undoing a score edit restores the derived RPN', () => {
    state().addRow();
    const id = state().rows[0].id;
    state().updateRow(id, { severity: 8 });
    expect(state().rows[0].rpn).toBe(8);

    state().undo();
    expect(state().rows[0].severity).toBe(1);
    expect(state().rows[0].rpn).toBe(1);
  });

  it('undoes a row deletion', () => {
    state().addRow();
    const id = state().rows[0].id;
    state().updateRow(id, { item: 'Seal' });
    state().deleteRow(id);
    expect(state().rows).toHaveLength(0);

    state().undo();
    expect(state().rows).toHaveLength(1);
    expect(state().rows[0].item).toBe('Seal');
  });

  it('a new edit clears the redo stack; selection is not undoable', () => {
    state().addRow();
    state().selectRow(state().rows[0].id);
    expect(state().undoStack).toHaveLength(1); // select recorded nothing

    state().undo();
    expect(state().redoStack).toHaveLength(1);
    state().addRow();
    expect(state().redoStack).toHaveLength(0);
  });

  it('loadRows clears history; empty-stack undo/redo are no-ops', () => {
    state().addRow();
    state().loadRows([]);
    expect(state().undoStack).toHaveLength(0);
    expect(() => {
      state().undo();
      state().redo();
    }).not.toThrow();
  });
});
