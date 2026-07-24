import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, FormEvent, KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthHeadline, AuthLayout } from '../components/auth/AuthLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api } from '../services/api';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

function safeRedirect(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';
}

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const emailFromQuery = searchParams.get('email') ?? '';
  const redirect = safeRedirect(searchParams.get('redirect'));
  const [email, setEmail] = useState(emailFromQuery);
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(emailFromQuery ? RESEND_COOLDOWN_SECONDS : 0);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldown((remaining) => Math.max(0, remaining - 1));
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function applyDigits(raw: string, startIndex = 0) {
    const incoming = raw.replace(/\D/g, '').slice(0, CODE_LENGTH - startIndex);
    if (!incoming) return;

    setDigits((current) => {
      const next = [...current];
      for (let offset = 0; offset < incoming.length; offset += 1) {
        next[startIndex + offset] = incoming[offset];
      }
      return next;
    });
    const nextIndex = Math.min(startIndex + incoming.length, CODE_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  }

  function handleDigitChange(index: number, value: string) {
    const numeric = value.replace(/\D/g, '');
    if (!numeric) {
      setDigits((current) => current.map((digit, position) => (position === index ? '' : digit)));
      return;
    }
    applyDigits(numeric, index);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[index]) {
        setDigits((current) => current.map((digit, position) => (position === index ? '' : digit)));
      } else if (index > 0) {
        setDigits((current) =>
          current.map((digit, position) => (position === index - 1 ? '' : digit)),
        );
        inputRefs.current[index - 1]?.focus();
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    event.preventDefault();
    applyDigits(pasted, 0);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const code = digits.join('');
    if (!email || code.length !== CODE_LENGTH) {
      setError('Enter your email and the complete 6-digit code.');
      return;
    }

    setError('');
    setNotice('');
    setLoading(true);
    try {
      await api.auth.confirm(email, code);
      // Reload so AuthProvider reads the new session cookie before protected
      // routes render; a client-only navigation would still hold guest state.
      window.location.assign(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed');
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email || cooldown > 0 || resending) return;
    setError('');
    setNotice('');
    setResending(true);
    try {
      await api.auth.resendCode(email);
      setDigits(Array(CODE_LENGTH).fill(''));
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice('If the account is awaiting confirmation, a fresh code is on its way.');
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code');
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout
      headline={
        <AuthHeadline>
          One quick check,
          <br />
          then you&apos;re in.
        </AuthHeadline>
      }
      blurb="Enter the short code from your inbox to activate your RAMSey account."
    >
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-surface-900">
        Confirm your email
      </h1>
      <p className="mb-8 text-sm text-surface-400">
        We sent a 6-digit code to{' '}
        {emailFromQuery ? <strong>{emailFromQuery}</strong> : 'your inbox'}.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {!emailFromQuery && (
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        )}

        <div>
          <p
            id="confirmation-code-label"
            className="mb-2 block text-sm font-medium text-surface-700"
          >
            Confirmation code
          </p>
          <div
            className="grid grid-cols-6 gap-2"
            role="group"
            aria-labelledby="confirmation-code-label"
          >
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                value={digit}
                onChange={(event) => handleDigitChange(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={handlePaste}
                aria-label={`Digit ${index + 1}`}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={index === 0 ? CODE_LENGTH : 1}
                autoFocus={index === 0}
                aria-invalid={Boolean(error)}
                className="h-12 min-w-0 rounded-md border border-surface-300 bg-white text-center text-xl font-semibold tabular-nums text-surface-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-surface-400 dark:bg-surface-50"
              />
            ))}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-900 px-3 py-2 text-sm text-red-500 dark:bg-red-100 dark:text-red-700"
          >
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-700">
            {notice}
          </p>
        )}

        <Button
          type="submit"
          disabled={loading || digits.some((digit) => !digit) || !email}
          size="lg"
          className="mt-1 w-full"
        >
          {loading ? 'Confirming…' : 'Confirm email'}
        </Button>
      </form>

      <div className="mt-5 text-center text-sm text-surface-400">
        Didn&apos;t get it?{' '}
        <button
          type="button"
          onClick={handleResend}
          disabled={!email || cooldown > 0 || resending}
          className="font-medium text-primary-600 hover:underline disabled:cursor-not-allowed disabled:text-surface-500 disabled:no-underline"
        >
          {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>

      <p className="mt-8 text-center text-sm">
        <Link
          to="/"
          className="text-surface-400 transition-colors hover:text-surface-600 hover:underline"
        >
          Continue without an account →
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-surface-500">
        <Link to="/login" className="hover:text-surface-500 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
