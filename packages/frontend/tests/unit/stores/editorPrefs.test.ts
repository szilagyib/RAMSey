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

describe('collapsible side panels', () => {
  beforeEach(() => {
    localStorage.clear();
    if (!state().palette) state().togglePalette();
    if (!state().inspector) state().toggleInspector();
  });

  it('both are open by default', () => {
    expect(state().palette).toBe(true);
    expect(state().inspector).toBe(true);
  });

  it('collapsing persists, so the layout survives a reload', () => {
    state().togglePalette();
    expect(state().palette).toBe(false);
    expect(localStorage.getItem('ramsey-palette')).toBe('off');

    state().toggleInspector();
    expect(state().inspector).toBe(false);
    expect(localStorage.getItem('ramsey-inspector')).toBe('off');
  });

  it('re-expanding clears the stored collapse', () => {
    state().togglePalette();
    state().togglePalette();
    expect(state().palette).toBe(true);
    expect(localStorage.getItem('ramsey-palette')).toBe('on');
  });
});

describe('sidebar tab', () => {
  beforeEach(() => state().setRightTab('properties'));

  it('starts on properties', () => {
    expect(state().rightTab).toBe('properties');
  });

  it('switches to analysis — running analysis docks it in the sidebar', () => {
    state().setRightTab('analysis');
    expect(state().rightTab).toBe('analysis');
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
