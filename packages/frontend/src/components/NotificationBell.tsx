import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../services/api';
import {
  formatNotification,
  formatNotificationAge,
  type AppNotification,
} from '../lib/notifications';
import { cn } from '../lib/utils';

const POLL_MS = 60_000;

/**
 * Bell + dropdown for the notifications the backend writes (analysis results,
 * shares). Polls the unread count; opening the dropdown marks everything read.
 * Render only for authenticated users — guests have no notifications.
 */
export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.notifications.list();
      setItems(res.data.items);
      setUnread(res.data.unread);
    } catch {
      // Offline / guest fallback: leave whatever we had.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount; state updates happen after await
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // Ref mirror so toggle sees the freshest unread without re-creating itself.
  const unreadRef = useRef(0);
  useEffect(() => {
    unreadRef.current = unread;
  }, [unread]);

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      await refresh();
      if (unreadRef.current > 0) {
        try {
          await api.notifications.readAll();
          setUnread(0);
        } catch {
          /* non-fatal */
        }
      }
    }
  }, [open, refresh]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={toggle}
        title="Notifications"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        className="relative rounded-md p-1.5 text-surface-400 hover:bg-surface-50 hover:text-surface-600 transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-md border border-surface-200 bg-white dark:bg-surface-100 dark:border-surface-300 py-1 shadow-lg">
          <div className="border-b border-surface-200 dark:border-surface-300 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
            Notifications
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-surface-400">Nothing here yet.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'flex items-start gap-2 px-3 py-2 text-sm',
                    !n.read && 'bg-primary-50 dark:bg-primary-900/30',
                  )}
                >
                  <span className="flex-1 text-surface-700">{formatNotification(n)}</span>
                  <span className="shrink-0 text-xs text-surface-400">
                    {formatNotificationAge(n.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
