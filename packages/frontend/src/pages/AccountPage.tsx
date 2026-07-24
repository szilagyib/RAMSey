import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/auth';
import { api } from '../services/api';

export function AccountPage() {
  const { user, logout, isGuest } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  async function handleExport() {
    setError('');
    setBusy('export');
    try {
      const res = await api.auth.exportData();
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ramsey-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setError('');
    setBusy('delete');
    try {
      await api.auth.deleteAccount();
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete account');
      setBusy(null);
    }
  }

  // Guests have no server-side account, so every action here (export, delete)
  // would fail against a local-only identity. Say what's needed instead.
  if (isGuest) {
    return (
      <div className="flex min-h-screen flex-col bg-surface-50">
        <header className="border-b border-surface-200 bg-white dark:bg-surface-100">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
            <Link
              to="/"
              className="text-surface-400 hover:text-surface-600"
              title="Back to dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold text-surface-900">Account</h1>
          </div>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center px-4 text-center sm:px-6">
          <p className="text-sm font-medium text-surface-700">
            The Account page requires an account.
          </p>
          <p className="mt-1.5 max-w-sm text-sm text-surface-500">
            You&apos;re using RAMSey as a guest, so there is no profile, export, or deletion to
            manage — your diagrams live in this browser only.
          </p>
          <Link
            to="/login"
            className="mt-4 inline-flex items-center rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            Log in or sign up
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="border-b border-surface-200 bg-white dark:bg-surface-100">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link
            to="/"
            className="text-surface-400 hover:text-surface-600"
            title="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold text-surface-900">Account</h1>
        </div>
      </header>

      {/* Compact spacing (and tighter still on short viewports) so the page fits
          without scrolling, as the auth screens do. */}
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 [@media(max-height:700px)]:py-4">
        <section className="mb-4 rounded-lg border border-surface-200 bg-white dark:bg-surface-100 p-5">
          <h2 className="mb-3 text-sm font-semibold text-surface-700">Profile</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-20 text-surface-400">Name</dt>
              <dd className="text-surface-700">{user?.name ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 text-surface-400">Email</dt>
              <dd className="text-surface-700">{user?.email}</dd>
            </div>
          </dl>
        </section>

        <section className="mb-4 rounded-lg border border-surface-200 bg-white dark:bg-surface-100 p-5">
          <h2 className="mb-1 text-sm font-semibold text-surface-700">Export your data</h2>
          <p className="mb-4 text-sm text-surface-400">
            Download a JSON copy of your profile, projects, diagrams, team memberships, and
            comments.
          </p>
          <Button variant="outline" onClick={handleExport} disabled={busy !== null}>
            {busy === 'export' ? 'Preparing…' : 'Export my data'}
          </Button>
        </section>

        <section className="rounded-lg border border-red-300 bg-white dark:bg-surface-100 p-5">
          <h2 className="mb-1 text-sm font-semibold text-red-600">Delete account</h2>
          <p className="mb-4 text-sm text-surface-400">
            Your personal details are erased and you&apos;re signed out. Projects and diagrams you
            shared stay available to your collaborators. This cannot be undone.
          </p>
          {error && (
            <p className="mb-4 rounded-md bg-red-900 dark:bg-red-100 px-3 py-2 text-sm text-red-500 dark:text-red-700">
              {error}
            </p>
          )}
          {!confirming ? (
            <Button
              variant="destructive"
              onClick={() => setConfirming(true)}
              disabled={busy !== null}
            >
              Delete my account
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-surface-700">Are you sure?</span>
              <Button variant="destructive" onClick={handleDelete} disabled={busy !== null}>
                {busy === 'delete' ? 'Deleting…' : 'Yes, delete'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy !== null}>
                Cancel
              </Button>
            </div>
          )}
        </section>

        <p className="mt-5 text-center text-xs text-surface-500">
          <Link to="/privacy" className="hover:text-surface-500 hover:underline">
            Privacy policy
          </Link>
        </p>
      </main>
    </div>
  );
}
