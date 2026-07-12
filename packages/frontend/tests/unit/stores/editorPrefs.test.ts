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
