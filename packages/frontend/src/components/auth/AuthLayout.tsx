import type { ReactNode } from 'react';
import { ThemeToggle } from '../ui/ThemeToggle';

/**
 * The shared frame for the sign-in and sign-up pages: a brand panel on the left,
 * the form on the right.
 *
 * Three things it is deliberately careful about.
 *
 * The seam. The two halves used to butt together at a hard vertical edge — near
 * black on the left, white (or, in dark mode, a blue-grey surface) on the right
 * — and the edge was made *worse* by a vignette that darkened the panel as it
 * approached the join. The panel's colour now dissolves into the page's own
 * background across the last third of its width, so there is no line to see;
 * the two colours simply become each other.
 *
 * The graph. It's the nicest thing on the page and it stays, but its lines were
 * running straight through the headline. A scrim now sits between the graph and
 * the copy: a soft radial wash, centred on the text, that fades the network out
 * underneath it and lets it breathe at the edges. The graph reads as depth
 * rather than as clutter.
 *
 * The colours. The graph and the notation list carried a palette invented for
 * this page alone — including the blue the fault-tree gates have since given
 * up. They now use the brand indigo and the notation's own colours.
 */

const NET_NODES = [
  { x: 250, y: 60 },
  { x: 130, y: 160 },
  { x: 370, y: 160 },
  { x: 60, y: 270 },
  { x: 185, y: 265 },
  { x: 315, y: 265 },
  { x: 440, y: 270 },
  { x: 35, y: 380 },
  { x: 115, y: 375 },
  { x: 195, y: 380 },
  { x: 300, y: 375 },
  { x: 390, y: 378 },
  { x: 455, y: 374 },
  { x: 85, y: 490 },
  { x: 200, y: 485 },
  { x: 340, y: 490 },
  { x: 445, y: 487 },
];

const NET_EDGES = [
  [0, 1],
  [0, 2],
  [1, 3],
  [1, 4],
  [2, 5],
  [2, 6],
  [3, 7],
  [3, 8],
  [4, 9],
  [5, 10],
  [5, 11],
  [6, 12],
  [7, 13],
  [8, 13],
  [9, 14],
  [10, 15],
  [11, 16],
  [12, 16],
  [1, 5],
  [4, 10],
  [11, 12],
];

/** The notation's own colours, so the list reads the way the app does. */
const DIAGRAM_TYPES = [
  { label: 'Fault Trees', color: '#94a3b8' }, // graphite gates
  { label: 'Markov Chains', color: '#22c55e' }, // operational
  { label: 'Event Trees', color: '#f59e0b' }, // degraded
  { label: 'RBD', color: '#818cf8' }, // primary-400
  { label: 'Bow-Tie', color: '#ef4444' }, // failed
  { label: 'FMEA', color: '#a5b4fc' }, // primary-300
];

function NetworkGraph() {
  return (
    <svg
      viewBox="0 0 500 560"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <circle cx={250} cy={60} r={52} fill="#6366f1" opacity="0.22" />
      {NET_EDGES.map(([a, b], i) => (
        <line
          key={i}
          x1={NET_NODES[a].x}
          y1={NET_NODES[a].y}
          x2={NET_NODES[b].x}
          y2={NET_NODES[b].y}
          stroke="#c7d2fe"
          strokeWidth="1"
          opacity="0.16"
        />
      ))}
      {NET_NODES.map((n, i) => (
        <circle
          key={i}
          cx={n.x}
          cy={n.y}
          r={i === 0 ? 7 : i < 3 ? 4.5 : 3.5}
          fill={i === 0 ? '#818cf8' : '#e0e7ff'}
          opacity={i === 0 ? 0.95 : i < 3 ? 0.35 : 0.2}
        />
      ))}
    </svg>
  );
}

interface AuthLayoutProps {
  /** The brand panel's headline. */
  headline: ReactNode;
  /** One line under it. */
  blurb: string;
  /** The form column. */
  children: ReactNode;
}

export function AuthLayout({ headline, blurb, children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen bg-[#f6f7fc] dark:bg-surface-100">
      {/* Theme toggle, floated over the form column (top-right) on every auth page. */}
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      {/* ── Brand panel ── */}
      <div className="relative hidden w-[46%] shrink-0 flex-col justify-between overflow-hidden px-14 py-12 lg:flex">
        {/* Ground: deep navy lifted toward indigo, so it belongs to the brand. */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#070c17] via-[#0c1326] to-[#191a45]" />

        {/* A single indigo bloom, top-right, to carry the eye toward the form. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 45% at 78% 8%, rgba(99,102,241,0.28) 0%, transparent 70%)',
          }}
        />

        <NetworkGraph />

        {/* The scrim: fades the graph out beneath the copy, keeps it at the edges. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(75% 52% at 24% 60%, rgba(7,12,23,0.95) 0%, rgba(7,12,23,0.78) 42%, rgba(7,12,23,0) 76%)',
          }}
        />

        {/* The dissolve: the panel becomes the page's background, so there is no
            seam — the two colours fade into each other instead of meeting. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[58%] bg-gradient-to-r from-transparent via-[#f6f7fc]/60 to-[#f6f7fc] dark:via-surface-100/60 dark:to-surface-100" />

        <div className="relative flex items-center gap-3">
          <img src="/favicon.svg" alt="" aria-hidden="true" className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight text-white">RAMSey</span>
        </div>

        <div className="relative max-w-[26rem]">
          {headline}
          <p className="mt-4 text-sm leading-relaxed text-white/45">{blurb}</p>
        </div>

        <div className="relative grid max-w-[24rem] grid-cols-2 gap-x-8 gap-y-3">
          {DIAGRAM_TYPES.map(({ label, color }) => (
            <div key={label} className="flex items-center gap-2.5">
              <span
                className="h-px w-4 shrink-0 rounded-full"
                style={{ backgroundColor: color, opacity: 0.8 }}
              />
              <span className="font-mono text-[11px] tracking-wide text-white/50">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Form ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
        <div className="mb-10 flex flex-col items-center gap-1.5 lg:hidden">
          <img src="/favicon.svg" alt="" aria-hidden="true" className="h-10 w-10" />
          <span className="text-lg font-semibold text-primary-600">RAMSey</span>
        </div>
        <div className="w-full max-w-[360px]">{children}</div>
      </div>
    </div>
  );
}

/** The headline style both pages use. */
export function AuthHeadline({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[2.15rem] leading-tight font-semibold tracking-tight text-white">
      {children}
    </h2>
  );
}
