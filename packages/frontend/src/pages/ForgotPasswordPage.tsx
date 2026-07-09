import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api } from '../services/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.auth.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-surface-200 bg-white dark:bg-surface-100 p-8 shadow-sm">
        <img src="/favicon.svg" alt="RAMSey" className="mx-auto mb-4 h-12 w-12" />
        <h1 className="mb-1 text-center text-xl font-semibold text-surface-900">Reset your password</h1>

        {sent ? (
          <>
            <p className="mb-6 mt-2 text-center text-sm text-surface-500">
              If an account exists for{' '}
              <span className="font-medium text-surface-700">{email}</span>, a reset link is
              on its way. Check your inbox.
            </p>
            <Link
              to="/login"
              className="block text-center text-sm font-medium text-primary-600 hover:underline"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mb-6 mt-2 text-center text-sm text-surface-400">
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
              {error && (
                <p className="rounded-md bg-red-900 dark:bg-red-100 px-3 py-2 text-sm text-red-500 dark:text-red-700">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={loading} size="lg" className="w-full">
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-surface-400">
              Remembered it?{' '}
              <Link to="/login" className="font-medium text-primary-600 hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
