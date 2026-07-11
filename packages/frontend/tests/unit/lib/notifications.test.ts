import { describe, it, expect } from 'vitest';
import { formatNotification, formatNotificationAge } from '../../../src/lib/notifications';

describe('formatNotification', () => {
  it('renders analysis outcomes with the method name', () => {
    expect(
      formatNotification({ type: 'ANALYSIS_COMPLETE', payload: { method: 'steady_state' } }),
    ).toBe('Analysis finished: steady state');
    expect(
      formatNotification({ type: 'ANALYSIS_FAILED', payload: { method: 'mttf', error: 'no absorbing state' } }),
    ).toBe('Analysis failed: mttf — no absorbing state');
  });

  it('renders shares and falls back gracefully for unknown types', () => {
    expect(
      formatNotification({ type: 'PROJECT_SHARED', payload: { projectName: 'Pumps' } }),
    ).toBe('A project was shared with you: Pumps');
    expect(formatNotification({ type: 'PROJECT_SHARED', payload: {} })).toBe(
      'A project was shared with you',
    );
    expect(formatNotification({ type: 'SOMETHING_NEW', payload: {} })).toBe('something new');
  });
});

describe('formatNotificationAge', () => {
  const now = new Date('2026-07-11T12:00:00Z');

  it('renders compact relative ages', () => {
    expect(formatNotificationAge('2026-07-11T11:59:40Z', now)).toBe('now');
    expect(formatNotificationAge('2026-07-11T11:45:00Z', now)).toBe('15m');
    expect(formatNotificationAge('2026-07-11T07:00:00Z', now)).toBe('5h');
    expect(formatNotificationAge('2026-07-08T12:00:00Z', now)).toBe('3d');
  });

  it('handles malformed dates without throwing', () => {
    expect(formatNotificationAge('nonsense', now)).toBe('');
  });
});
