import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

type Status = 'pending' | 'success' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'pending' : 'error');
  // Guard against React StrictMode's double-invoke — the token is single-use,
  // so a second call would consume nothing and report a false failure.
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api.auth
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-surface-200 bg-white dark:bg-surface-100 p-8 shadow-sm text-center">
        <img src="/favicon.svg" alt="RAMSey" className="mx-auto mb-4 h-12 w-12" />

        {status === 'pending' && (
          <>
            <h1 className="mb-2 text-xl font-semibold text-surface-900">Verifying your email…</h1>
            <p className="text-sm text-surface-400">One moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 className="mb-2 text-xl font-semibold text-surface-900">Email verified</h1>
            <p className="mb-6 text-sm text-surface-500">
              Thanks — your email address is confirmed.
            </p>
            <Link
              to="/"
              className="block text-center text-sm font-medium text-primary-600 hover:underline"
            >
              Go to your dashboard
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="mb-2 text-xl font-semibold text-surface-900">Verification failed</h1>
            <p className="mb-6 text-sm text-surface-500">
              This verification link is invalid or has expired. Sign in and request a new one
              from your account.
            </p>
            <Link
              to="/login"
              className="block text-center text-sm font-medium text-primary-600 hover:underline"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
