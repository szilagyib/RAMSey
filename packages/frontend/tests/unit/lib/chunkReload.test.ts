import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryChunkLoad } from '../../../src/App';

// Reloading is the only side effect we care about; jsdom's location is read-only.
const reload = vi.fn();

beforeEach(() => {
  reload.mockClear();
  sessionStorage.clear();
  vi.stubGlobal('location', { reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const chunkError = () => new Error('Failed to fetch dynamically imported module: /assets/x.js');

describe('retryChunkLoad', () => {
  it('passes a successful import straight through', async () => {
    await expect(retryChunkLoad(async () => 'module')).resolves.toBe('module');
    expect(reload).not.toHaveBeenCalled();
  });

  // A tab from before a deploy asking for a chunk that no longer exists.
  it('reloads once on a chunk-load failure', async () => {
    // The returned promise never settles — the reload takes over — so assert on
    // the side effect rather than awaiting it.
    void retryChunkLoad(() => Promise.reject(chunkError()));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });

  it('does not reload twice inside the guard window', async () => {
    void retryChunkLoad(() => Promise.reject(chunkError()));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());

    await expect(retryChunkLoad(() => Promise.reject(chunkError()))).rejects.toThrow();
    expect(reload).toHaveBeenCalledOnce();
  });

  // A module that throws while evaluating is a real bug: surface it, don't
  // reload the page and hide it.
  it('propagates a genuine module error without reloading', async () => {
    const bug = new Error('Cannot read properties of undefined');
    await expect(retryChunkLoad(() => Promise.reject(bug))).rejects.toThrow(bug);
    expect(reload).not.toHaveBeenCalled();
  });
});
