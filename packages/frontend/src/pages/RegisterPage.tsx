import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api } from '../services/api';

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
    <div className="flex min-h-screen">
      {/* ── Left: branding panel ── */}
      <div className="relative hidden lg:flex lg:w-[45%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#080e1a] via-[#0b1220] to-[#0d1530] px-14 py-12">
        <NetworkSVG />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-black/25 to-transparent" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <img src="/favicon.svg" alt="RAMSey" className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight text-white">RAMSey</span>
        </div>

        {/* Main copy */}
        <div className="relative">
          <h2 className="text-[2.15rem] font-semibold leading-tight tracking-tight text-white">
            Start your<br />analysis journey.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/40">
            Create your account and start building safety-critical system models in minutes.
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

      {/* ── Right: form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white dark:bg-surface-100 px-8 py-12">
        {/* Mobile logo */}
        <div className="mb-10 flex flex-col items-center gap-1.5 lg:hidden">
          <img src="/favicon.svg" alt="RAMSey" className="h-10 w-10" />
          <span className="text-lg font-semibold text-primary-600">RAMSey</span>
        </div>

        <div className="w-full max-w-[360px]">
          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-surface-900">Create an account</h1>
          <p className="mb-8 text-sm text-surface-400">Fill in your details to get started.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)" autoComplete="name" />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" required autoComplete="email" />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters" required autoComplete="new-password" />
            <Input label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••" required autoComplete="new-password" />

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
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
