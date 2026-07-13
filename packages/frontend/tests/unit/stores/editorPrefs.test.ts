import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorPrefs } from '../../../src/stores/editorPrefs';

const state = () => useEditorPrefs.getState();

describe('editor background preference', () => {
  beforeEach(() => {
    localStorage.clear();
    state().setBackground('dots');
  });

  it('defaults to dots', () => {
    expect(state().background).toBe('dots');
  });

  it('cycles dots -> grid -> none -> dots', () => {
    state().cycleBackground();
    expect(state().background).toBe('grid');
    state().cycleBackground();
    expect(state().background).toBe('none');
    state().cycleBackground();
    expect(state().background).toBe('dots');
  });

  it('persists the choice to localStorage', () => {
    state().setBackground('grid');
    expect(localStorage.getItem('ramsey-bg-mode')).toBe('grid');
  });
});

describe('inline label editing state', () => {
  beforeEach(() => state().stopEditing());

  it('is idle by default', () => {
    expect(state().editing).toBeNull();
  });

  it('tracks the node or edge being renamed', () => {
    state().startEditing('node', 'n1');
    expect(state().editing).toEqual({ kind: 'node', id: 'n1' });

    state().startEditing('edge', 'e1');
    expect(state().editing).toEqual({ kind: 'edge', id: 'e1' });
  });

  it('is transient — never persisted, since ids are only unique per diagram', () => {
    state().startEditing('node', 'n1');
    expect(localStorage.getItem('ramsey-editing')).toBeNull();

    state().stopEditing();
    expect(state().editing).toBeNull();
  });
});
