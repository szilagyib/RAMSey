import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api } from '../services/api';
import { AuthLayout, AuthHeadline } from '../components/auth/AuthLayout';

// ─── Register page ────────────────────────────────────────────────────────────

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    // The input is `required`, so the browser blocks submission first — but a
    // consent gate is not something to leave to the client's markup alone.
    if (!consent) {
      setError('Please agree to the Privacy Policy to create an account.');
      return;
    }
    setLoading(true);
    try {
      await api.auth.register({ email, password, name: name.trim() || undefined });
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      headline={
        <AuthHeadline>
          Start your
          <br />
          analysis journey.
        </AuthHeadline>
      }
      blurb="Create your account and start building safety-critical system models in minutes."
    >
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-surface-900">
        Create an account
      </h1>
      <p className="mb-8 text-sm text-surface-400">Fill in your details to get started.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          autoComplete="name"
        />
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
          placeholder="Min. 8 characters"
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

        <label className="flex items-start gap-2.5 text-sm text-surface-600">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
          />
          <span>
            I have read and agree to the{' '}
            <Link
              to="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {error && (
          <p className="rounded-md bg-red-900 dark:bg-red-100 px-3 py-2 text-sm text-red-500 dark:text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} size="lg" className="w-full mt-1">
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-surface-400">
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
