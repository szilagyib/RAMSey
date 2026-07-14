import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api } from '../services/api';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-surface-200 bg-white dark:bg-surface-100 p-8 shadow-sm">
        <img src="/favicon.svg" alt="RAMSey" className="mx-auto mb-4 h-12 w-12" />
        <h1 className="mb-1 text-center text-xl font-semibold text-surface-900">
          Set a new password
        </h1>

        {!token ? (
          <>
            <p className="mb-6 mt-2 text-center text-sm text-surface-500">
              This reset link is invalid or incomplete.
            </p>
            <Link
              to="/forgot-password"
              className="block text-center text-sm font-medium text-primary-600 hover:underline"
            >
              Request a new link
            </Link>
          </>
        ) : done ? (
          <>
            <p className="mb-6 mt-2 text-center text-sm text-surface-500">
              Your password has been reset. You can sign in with it now.
            </p>
            <Button
              size="lg"
              className="w-full"
              onClick={() => navigate('/login', { replace: true })}
            >
              Sign in
            </Button>
          </>
        ) : (
          <>
            <p className="mb-6 mt-2 text-center text-sm text-surface-400">
              Choose a new password for your account.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <Input
                label="New password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
              <Input
                label="Confirm password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
              {error && (
                <p className="rounded-md bg-red-900 dark:bg-red-100 px-3 py-2 text-sm text-red-500 dark:text-red-700">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={loading} size="lg" className="w-full">
                {loading ? 'Resetting…' : 'Reset password'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
