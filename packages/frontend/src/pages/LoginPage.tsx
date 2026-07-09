import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../contexts/auth';

// ─── Shared left-panel assets ─────────────────────────────────────────────────

const NET_NODES = [
  { x: 250, y: 60 },
  { x: 130, y: 160 }, { x: 370, y: 160 },
  { x: 60,  y: 270 }, { x: 185, y: 265 }, { x: 315, y: 265 }, { x: 440, y: 270 },
  { x: 35,  y: 380 }, { x: 115, y: 375 }, { x: 195, y: 380 }, { x: 300, y: 375 }, { x: 390, y: 378 }, { x: 455, y: 374 },
  { x: 85,  y: 490 }, { x: 200, y: 485 }, { x: 340, y: 490 }, { x: 445, y: 487 },
];
const NET_EDGES = [
  [0,1],[0,2],[1,3],[1,4],[2,5],[2,6],[3,7],[3,8],[4,9],[5,10],[5,11],[6,12],
  [7,13],[8,13],[9,14],[10,15],[11,16],[12,16],[1,5],[4,10],[11,12],
];

function NetworkSVG() {
  return (
    <svg viewBox="0 0 500 560" className="absolute inset-0 h-full w-full" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      {/* Soft glow behind root node */}
      <circle cx={250} cy={60} r={44} fill="#3b62a6" opacity="0.18" />
      {NET_EDGES.map(([a, b], i) => (
        <line key={i}
          x1={NET_NODES[a].x} y1={NET_NODES[a].y}
          x2={NET_NODES[b].x} y2={NET_NODES[b].y}
          stroke="white" strokeWidth="1" opacity="0.14"
        />
      ))}
      {NET_NODES.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y}
          r={i === 0 ? 7 : i < 3 ? 4.5 : 3.5}
          fill={i === 0 ? '#4c7bd6' : 'white'}
          opacity={i === 0 ? 0.85 : i < 3 ? 0.3 : 0.18}
        />
      ))}
    </svg>
  );
}

const DIAGRAM_TYPES = [
  { label: 'Fault Trees',    color: '#4c7bd6' },
  { label: 'Markov Chains',  color: '#6bca8a' },
  { label: 'Event Trees',    color: '#e2a84c' },
  { label: 'RBD',            color: '#f472b6' },
  { label: 'Bow-Tie',        color: '#a78bfa' },
  { label: 'FMEA',           color: '#94a3b8' },
];

function BrandingPanel({ heading }: { heading: React.ReactNode }) {
  return (
    <div className="relative hidden lg:flex lg:w-[45%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#080e1a] via-[#0b1220] to-[#0d1530] px-14 py-12">
      <NetworkSVG />

      {/* Subtle right-edge fade to soften the split */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-black/25 to-transparent" />

      {/* Logo */}
      <div className="relative flex items-center gap-3">
        <img src="/favicon.svg" alt="RAMSey" className="h-8 w-8" />
        <span className="text-lg font-semibold tracking-tight text-white">RAMSey</span>
      </div>

      {/* Main copy */}
      <div className="relative">
        {heading}
        <p className="mt-4 text-sm leading-relaxed text-white/40">
          Build, validate, and collaborate on safety-critical system models — from block diagrams to full FMEA studies.
        </p>
      </div>

      {/* Diagram type grid */}
      <div className="relative grid grid-cols-2 gap-x-8 gap-y-3">
        {DIAGRAM_TYPES.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2.5">
            <span className="h-px w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: color, opacity: 0.75 }} />
            <span className="font-mono text-[11px] tracking-wide text-white/45">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Login page ───────────────────────────────────────────────────────────────

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const redirect = searchParams.get('redirect') ?? '/';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <BrandingPanel heading={
        <h2 className="text-[2.15rem] font-semibold leading-tight tracking-tight text-white">
          Reliability analysis<br />for complex systems.
        </h2>
      } />

      {/* ── Right: form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white dark:bg-surface-100 px-8 py-12">
        {/* Mobile logo */}
        <div className="mb-10 flex flex-col items-center gap-1.5 lg:hidden">
          <img src="/favicon.svg" alt="RAMSey" className="h-10 w-10" />
          <span className="text-lg font-semibold text-primary-600">RAMSey</span>
        </div>

        <div className="w-full max-w-[360px]">
          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-surface-900">Welcome back</h1>
          <p className="mb-8 text-sm text-surface-400">Sign in to your account to continue.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" required autoComplete="email" />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="current-password" />
            <div className="-mt-3 text-right">
              <Link to="/forgot-password" className="text-xs font-medium text-primary-600 hover:underline">
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

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 border-t border-surface-200 dark:border-surface-300" />
            <span className="text-xs text-surface-400">or</span>
            <div className="flex-1 border-t border-surface-200 dark:border-surface-300" />
          </div>

          <a
            href="/api/auth/google"
            className="flex w-full items-center justify-center gap-2.5 rounded-md border border-surface-200 dark:border-surface-400 bg-white dark:bg-surface-200 px-4 py-2.5 text-sm font-medium text-surface-700 dark:text-surface-800 hover:bg-surface-50 dark:hover:bg-surface-300 transition-colors"
          >
            <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>

          <p className="mt-8 text-center text-sm text-surface-400">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-medium text-primary-600 hover:text-primary-700 hover:underline">
              Create one
            </Link>
          </p>

          <p className="mt-3 text-center text-sm">
            <Link to="/" className="text-surface-400 hover:text-surface-600 hover:underline transition-colors">
              Continue without an account →
            </Link>
          </p>

          <p className="mt-6 text-center text-xs text-surface-300">
            <Link to="/privacy" className="hover:text-surface-500 hover:underline">
              Privacy policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
