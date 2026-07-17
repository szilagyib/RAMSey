import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../contexts/auth';
import { AuthLayout, AuthHeadline } from '../components/auth/AuthLayout';
import { PendingVerificationError } from '../services/api';
import { apiUrl } from '../config/runtime';
import { useCapabilities } from '../lib/capabilities';

// ─── Login page ───────────────────────────────────────────────────────────────

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { googleOAuth } = useCapabilities();

  const redirect = searchParams.get('redirect') ?? '/';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(redirect, { replace: true });
    } catch (err) {
      if (err instanceof PendingVerificationError) {
        const params = new URLSearchParams({ email: err.email });
        if (redirect !== '/') params.set('redirect', redirect);
        navigate(`/verify-email?${params.toString()}`, { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      fitShortViewport
      headline={
        <AuthHeadline>
          Reliability analysis
          <br />
          for complex systems.
        </AuthHeadline>
      }
      blurb="Build, validate, and collaborate on safety-critical system models — from block diagrams to full FMEA studies."
    >
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-surface-900">Welcome back</h1>
      <p className="mb-8 text-sm text-surface-400 [@media(max-height:700px)]:mb-5">
        Sign in to your account to continue.
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 [@media(max-height:700px)]:gap-4"
      >
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
        <div className="-mt-3 text-right">
          <Link
            to="/forgot-password"
            className="text-xs font-medium text-primary-600 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        {error && (
          <p className="rounded-md bg-red-900 dark:bg-red-100 px-3 py-2 text-sm text-red-500 dark:text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} size="lg" className="w-full mt-1">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {googleOAuth && (
        <>
          <div className="my-6 flex items-center gap-3 [@media(max-height:700px)]:my-4">
            <div className="flex-1 border-t border-surface-200 dark:border-surface-300" />
            <span className="text-xs text-surface-400">or</span>
            <div className="flex-1 border-t border-surface-200 dark:border-surface-300" />
          </div>

          <a
            href={apiUrl('/api/auth/google')}
            className="flex w-full items-center justify-center gap-2.5 rounded-md border border-surface-200 dark:border-surface-400 bg-white dark:bg-surface-200 px-4 py-2.5 text-sm font-medium text-surface-700 dark:text-surface-800 hover:bg-surface-50 dark:hover:bg-surface-300 transition-colors"
          >
            <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </a>
        </>
      )}

      <p className="mt-8 text-center text-sm text-surface-400 [@media(max-height:700px)]:mt-5">
        Don&apos;t have an account?{' '}
        <Link
          to="/register"
          className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
        >
          Create one
        </Link>
      </p>

      <p className="mt-3 text-center text-sm">
        <Link
          to="/"
          className="text-surface-400 hover:text-surface-600 hover:underline transition-colors"
        >
          Continue without an account →
        </Link>
      </p>

      <p className="mt-6 text-center text-xs text-surface-500 dark:text-surface-400 [@media(max-height:700px)]:mt-4">
        <Link to="/privacy" className="hover:text-surface-500 hover:underline">
          Privacy policy
        </Link>
      </p>
    </AuthLayout>
  );
}
