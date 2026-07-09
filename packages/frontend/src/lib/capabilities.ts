import { useEffect, useState } from 'react';

/**
 * Deployment capabilities: which optional features the backend has enabled.
 * Fail-closed — until the backend confirms a capability, the UI treats it as
 * off, so an unconfigured deployment hides features instead of breaking them.
 */
export interface Capabilities {
  aiChat: boolean;
  serverAnalysis: boolean;
}

export const NO_CAPABILITIES: Capabilities = { aiChat: false, serverAnalysis: false };

export async function fetchCapabilities(): Promise<Capabilities> {
  try {
    const res = await fetch('/api/capabilities', { credentials: 'include' });
    if (!res.ok) return NO_CAPABILITIES;
    const body = (await res.json()) as Partial<Capabilities>;
    return {
      aiChat: body.aiChat === true,
      serverAnalysis: body.serverAnalysis === true,
    };
  } catch {
    return NO_CAPABILITIES;
  }
}

// One fetch per page load, shared by every consumer.
let cached: Promise<Capabilities> | null = null;

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>(NO_CAPABILITIES);
  useEffect(() => {
    let alive = true;
    cached ??= fetchCapabilities();
    cached.then((c) => {
      if (alive) setCaps(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return caps;
}

/** Test hook: reset the module-level cache. */
export function resetCapabilitiesCache(): void {
  cached = null;
}
