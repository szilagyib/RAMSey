/**
 * Human-readable rendering of notification records (pure — unit-tested).
 * Payload shapes come from the backend writers: processAnalysisJob
 * (jobId/diagramId/method/error) and the share service (projectName/…).
 */
export interface AppNotification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export function formatNotification(n: Pick<AppNotification, 'type' | 'payload'>): string {
  const p = n.payload ?? {};
  const method = typeof p.method === 'string' ? p.method.replace(/_/g, ' ') : 'analysis';
  switch (n.type) {
    case 'ANALYSIS_COMPLETE':
      return `Analysis finished: ${method}`;
    case 'ANALYSIS_FAILED':
      return `Analysis failed: ${method}${typeof p.error === 'string' ? ` — ${p.error}` : ''}`;
    case 'PROJECT_SHARED':
      return typeof p.projectName === 'string'
        ? `A project was shared with you: ${p.projectName}`
        : 'A project was shared with you';
    case 'COMMENT_ADDED':
      return 'New comment on your diagram';
    case 'COMMENT_RESOLVED':
      return 'A comment was resolved';
    case 'MENTION':
      return 'You were mentioned in a comment';
    default:
      return n.type.replace(/_/g, ' ').toLowerCase();
  }
}

/** Compact relative timestamp ("3m", "2h", "5d"); falls back to the date. */
export function formatNotificationAge(createdAt: string, now: Date = new Date()): string {
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.floor((now.getTime() - then) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  return new Date(createdAt).toLocaleDateString();
}
