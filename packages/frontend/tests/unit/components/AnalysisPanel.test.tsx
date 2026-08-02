import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import type { AnalyzeResponse } from '@ramsey/engine';

const mocks = vi.hoisted(() => ({
  runAnalysis: vi.fn(),
  diagramType: 'fault_tree' as string,
}));

vi.mock('../../../src/stores/diagramStore', () => ({
  useDiagramStore: (selector: (s: unknown) => unknown) =>
    selector({
      nodes: [{ id: 'n1' }],
      edges: [],
      diagramType: mocks.diagramType,
    }),
}));

// The IR itself is irrelevant here — only that buildIR() returns something.
vi.mock('../../../src/lib/toModelIR', () => ({
  markovToModelIR: () => ({ ir: 'markov' }),
  faultTreeToModelIR: () => ({ ir: 'fault_tree' }),
  rbdToModelIR: () => ({ ir: 'rbd' }),
  eventTreeToModelIR: () => ({ ir: 'event_tree' }),
  bowTieToModelIR: () => ({ ir: 'bow_tie' }),
}));

vi.mock('../../../src/lib/analysisClient', () => ({ runAnalysis: mocks.runAnalysis }));
vi.mock('../../../src/services/api', () => ({ api: { analysis: {} } }));
vi.mock('../../../src/lib/capabilities', () => ({
  useCapabilities: () => ({
    aiChat: false,
    aiProviderLabel: null,
    serverAnalysis: false,
    googleOAuth: false,
  }),
}));

import { AnalysisPanel } from '../../../src/components/editor/AnalysisPanel';
import { setCachedResult } from '../../../src/lib/analysisCache';

function response(method: string, metrics: Record<string, number>): AnalyzeResponse {
  return {
    status: 'success',
    solver: { name: 'test', version: '1.0.0' },
    modelIRVersion: '1.0.0',
    contentHash: 'hash',
    metrics,
    contributions: {},
    numericMetadata: {
      method,
      tolerance: 0,
      iterations: 0,
      residualNorm: 0,
      truncation: 0,
      stiffnessDetected: false,
      methodAutoSelected: false,
    },
    trace: {
      assumptions: [],
      normalizations: [],
      unitConversions: [],
      simplifications: [],
      methodDetails: '',
    },
    warnings: [],
    errorBounds: {},
    computeTimeMs: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
  };
}

const methodSelect = () => screen.getByRole('combobox') as HTMLSelectElement;
const runButton = () => screen.getByRole('button', { name: /Run analysis/ });

afterEach(() => {
  cleanup();
  localStorage.clear();
  mocks.runAnalysis.mockReset();
});
beforeEach(() => {
  localStorage.clear();
  mocks.diagramType = 'fault_tree';
});

describe('AnalysisPanel — method/result state sync', () => {
  // Regression: the restore effect re-fired when run() cleared `result`, pulling
  // the previous run's method out of the cache and overwriting the user's pick.
  // The dropdown then disagreed with the results shown below it.
  it('keeps the selected method when a previous result exists for the diagram', async () => {
    // A prior top-event-probability run is already stored for this diagram.
    setCachedResult('d1', 'reliability', 'old-hash', response('reliability', { probability: 0.1 }));

    let finish!: (r: AnalyzeResponse) => void;
    mocks.runAnalysis.mockImplementation(
      () =>
        new Promise<AnalyzeResponse>((resolve) => {
          finish = resolve;
        }),
    );

    render(<AnalysisPanel projectId="p1" diagramId="d1" />);

    fireEvent.change(methodSelect(), { target: { value: 'minimal_cut_sets' } });
    expect(methodSelect().value).toBe('minimal_cut_sets');

    fireEvent.click(runButton());
    // Let the effects triggered by run()'s setResult(null) flush.
    await act(async () => {});

    expect(methodSelect().value).toBe('minimal_cut_sets');

    await act(async () => {
      finish(response('minimal_cut_sets', { cut_set_count: 9 }));
    });

    expect(screen.getByText('cut_set_count')).toBeTruthy();
    expect(methodSelect().value).toBe('minimal_cut_sets');
    // A freshly computed result is not a cache hit.
    expect(screen.queryByText(/Cached result/)).toBeNull();
  });

  it('restores the last stored result and its method on mount', () => {
    setCachedResult(
      'd1',
      'minimal_cut_sets',
      'h',
      response('minimal_cut_sets', { cut_set_count: 9 }),
    );

    render(<AnalysisPanel projectId="p1" diagramId="d1" />);

    expect(methodSelect().value).toBe('minimal_cut_sets');
    expect(screen.getByText('cut_set_count')).toBeTruthy();
    expect(screen.getByText(/Cached result/)).toBeTruthy();
  });

  // The panel is conditionally rendered per tab (RightPanel), so switching to
  // Properties and back is a real unmount/remount — restore must run again.
  it('restores again after an unmount/remount', () => {
    setCachedResult(
      'd1',
      'minimal_cut_sets',
      'h',
      response('minimal_cut_sets', { cut_set_count: 9 }),
    );

    const first = render(<AnalysisPanel projectId="p1" diagramId="d1" />);
    expect(methodSelect().value).toBe('minimal_cut_sets');
    first.unmount();

    render(<AnalysisPanel projectId="p1" diagramId="d1" />);
    expect(methodSelect().value).toBe('minimal_cut_sets');
    expect(screen.getByText('cut_set_count')).toBeTruthy();
  });

  // The app mounts under StrictMode, which double-invokes effects.
  it('restores under StrictMode', () => {
    setCachedResult(
      'd1',
      'minimal_cut_sets',
      'h',
      response('minimal_cut_sets', { cut_set_count: 9 }),
    );

    render(
      <StrictMode>
        <AnalysisPanel projectId="p1" diagramId="d1" />
      </StrictMode>,
    );

    expect(methodSelect().value).toBe('minimal_cut_sets');
    expect(screen.getByText('cut_set_count')).toBeTruthy();
  });

  // Navigating between diagrams does not remount the panel (EditorPage renders
  // DiagramEditor unkeyed), so the result we navigated away from must not stay.
  it('drops the previous diagram’s result when the diagram has none', () => {
    setCachedResult(
      'd1',
      'minimal_cut_sets',
      'h',
      response('minimal_cut_sets', { cut_set_count: 9 }),
    );

    const { rerender } = render(<AnalysisPanel projectId="p1" diagramId="d1" />);
    expect(screen.getByText('cut_set_count')).toBeTruthy();

    rerender(<AnalysisPanel projectId="p1" diagramId="d2" />);

    expect(screen.queryByText('cut_set_count')).toBeNull();
  });

  // Same reason: `method` must not survive as a value the new type's dropdown
  // cannot show, or the panel would run something other than what it displays.
  it('runs the method the dropdown displays after the diagram type changes', async () => {
    mocks.runAnalysis.mockResolvedValue(response('availability', { availability: 0.99 }));

    const { rerender } = render(<AnalysisPanel projectId="p1" diagramId="d1" />);
    fireEvent.change(methodSelect(), { target: { value: 'minimal_cut_sets' } });

    mocks.diagramType = 'markov_chain';
    rerender(<AnalysisPanel projectId="p1" diagramId="d2" />);

    // A select whose value matches no option falls back to displaying option 0,
    // so compare against what the user actually sees, not against the raw value.
    const shown = methodSelect().options[methodSelect().selectedIndex].value;
    expect(shown).toBe('availability');

    await act(async () => {
      fireEvent.click(runButton());
    });

    expect(mocks.runAnalysis).toHaveBeenCalledWith(expect.objectContaining({ method: shown }));
  });
});
