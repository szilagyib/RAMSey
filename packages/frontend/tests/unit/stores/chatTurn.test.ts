import { describe, it, expect, afterEach } from 'vitest';
import { beginTurn, endTurn, stopActiveTurn } from '../../../src/stores/chatStore';

afterEach(() => {
  endTurn();
});

// The turn handle lives at module scope so it outlives the chat panel, which
// unmounts whenever the user switches right-hand tabs.
describe('active chat turn', () => {
  it('aborts the running turn when stopped', () => {
    const signal = beginTurn();
    expect(signal.aborted).toBe(false);

    stopActiveTurn();
    expect(signal.aborted).toBe(true);
  });

  it('does nothing when no turn is running', () => {
    expect(() => stopActiveTurn()).not.toThrow();
  });

  it('does not abort a finished turn', () => {
    const signal = beginTurn();
    endTurn();

    stopActiveTurn();
    expect(signal.aborted).toBe(false);
  });

  // Otherwise Stop would cancel a turn the user has already replaced.
  it('only ever stops the most recent turn', () => {
    const first = beginTurn();
    const second = beginTurn();

    stopActiveTurn();
    expect(first.aborted).toBe(false);
    expect(second.aborted).toBe(true);
  });
});
